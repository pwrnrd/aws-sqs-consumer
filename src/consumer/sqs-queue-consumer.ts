import { EventEmitter } from 'events';
import { PromiseResult } from 'aws-sdk/lib/request';
import { SQS, AWSError } from 'aws-sdk';
import { autoBind } from './auto-bind';
import { SQSError } from './sqs-errors';
import { TimeoutError } from './timeout-error';
import { SQSConfiguration } from '../sqs-configuration';
import { SQSMessage } from './sqs-message';
import { SQSAWSRegions } from '../aws-regions';

type ReceiveMessageResponse = PromiseResult<SQS.Types.ReceiveMessageResult, AWSError>;
type ReceiveMessageRequest = SQS.Types.ReceiveMessageRequest;
type MessageHandler = (message: SQSMessage) => Promise<void>;
type BatchMessageHandler = (messages: SQSMessage[]) => Promise<void>;
interface SQSQueueConsumerOptions {
	attributeNames?: string[];
	messageAttributeNames?: string[];
	stopped?: boolean;
	batchSize?: number;
	visibilityTimeout?: number;
	waitTimeSeconds?: number;
	authenticationErrorTimeout?: number;
	terminateVisibilityTimeout?: boolean;
	handleMessageTimeout?: number;
	handleMessage?: MessageHandler;
	handleMessageBatch?: BatchMessageHandler;
	pollingTimeout?: number;
}

/** Allows a number to be zero and still be true */
function setNumberToDefaultIfNotProvided(number: number | undefined, defaultVal: number): number {
	return !!number || number === 0 ? number : defaultVal;
}

/**
 * Emits the following events:
 * - started ; emitted when the queue is starting to poll for messages.
 * - stopped; emitted when the queue has stopped polling and processed its last message(s).
 * - error - with the actual error and the messages for which the error occurred as its parameters; emitted when an error occurred.
 * - timeout_error - with the actual error and the messages for which the error occurred as its parameters; emitted when a timeout_error occurred.
 * - processing_error - with the actual error and the messages for which the error occurred as its parameters; emitted when an processing error occurred.
 * - empty; emitted when no messages have been received
 * - message_received - with the message as its parameter; emitted for each message that has been received
 * - message_processed - with the message as its paramter; emitted when the message has been processed
 * - response_processed - when all messaged that where received in a batch have been processed.
 */
export class SQSConsumer extends EventEmitter {
	/** The URL of the queue from which to read messages */
	private _queueURL: string;

	/** Instance of AWS.SQS */
	private _SQS: SQS;

	/** Whether or not this consumer is polling for new messages */
	private _stopped = true;

	/**
	 * Whether or not the consumer is polling or processing a message (batch).
	 * After stopping (this._stopped = true) the consumer might still poll one last time
	 * or might still be processing messages.
	 */
	private _isPollingOrProcessing = false;

	/** If true, sets the message visibility timeout to 0 after a processing_error (defaults to false). */
	private _isTerminateVisibilityTimeout: boolean;

	/**  The duration (in seconds) for which the call will wait for a message to arrive in the queue before returning. */
	private _waitTimeSeconds: number;

	/**
	 * Time in ms to wait for handleMessage to process a message before timing out. Emits timeout_error on timeout.
	 * By default, if handleMessage times out, the unprocessed message returns to the end of the queue.
	 */
	private _handleMessageTimeout?: number;

	/**  An async function (or function that returns a Promise) to be called whenever a message is received. Receives an SQS message object as it's first argument. */
	private _handleMessage?: MessageHandler;

	/**
	 * An async function (or function that returns a Promise) to be called whenever a batch of messages is received. Similar to handleMessage but will receive the list of messages,
	 * not each message individually. If both are set, handleMessageBatch overrides handleMessage. */
	private _handleMessageBatch?: BatchMessageHandler;

	/** The duration (in milliseconds) to wait before retrying after an authentication error (defaults to 10000). */
	private _authenticationErrorTimeout: number;

	/**  List of queue attributes to retrieve (i.e. ['All', 'ApproximateFirstReceiveTimestamp', 'ApproximateReceiveCount']). */
	private _attributeNames: string[];

	/**  List of message attributes to retrieve (i.e. ['name', 'address']). */
	private _messageAttributeNames: string[];

	/** The number of messages to request from SQS when polling (default 1). This cannot be higher than the AWS limit of 10. */
	private _batchSize: number;

	/**  The duration (in seconds) that the received messages are hidden from subsequent retrieve requests after being retrieved by a ReceiveMessage request. */
	private _visibilityTimeout: number;

	/** The time between polls */
	private _pollingTimeout: number;

	/** Polling timer */
	private _timer?: NodeJS.Timer;

	constructor(
		queueURL: string,
		{
			waitTimeSeconds,
			handleMessageTimeout,
			handleMessage,
			handleMessageBatch,
			batchSize,
			authenticationErrorTimeout,
			attributeNames,
			messageAttributeNames,
			terminateVisibilityTimeout,
			visibilityTimeout,
			pollingTimeout,
		}: SQSQueueConsumerOptions = {},
		SQSOrSQSConfiguration?: SQS | SQSConfiguration,
	) {
		super();
		if (!queueURL) throw new Error('To create a Queue Consumer you must provide a queue URL');
		if (!handleMessageBatch && !handleMessage)
			throw new Error('You must provide either a batch or individual message handler');
		if (batchSize === 0 || (batchSize && (batchSize < 1 || batchSize > 10)))
			throw new Error('The batch size must be in the following range: [1,10]');
		if (
			!SQSOrSQSConfiguration &&
			!(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
		)
			throw new Error(
				'Cannot create an SQS consumer without a SQS object, SQS Configuration or AWS environment variables: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY',
			);

		this._SQS = !SQSOrSQSConfiguration
			? new SQS(
					new SQSConfiguration({
						region: SQSAWSRegions[process.env.AWS_REGION as keyof typeof SQSAWSRegions],
						accessKeyID: process.env.AWS_ACCESS_KEY_ID as string,
						secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
					}).getConnectionObject(),
			  )
			: SQSOrSQSConfiguration instanceof SQSConfiguration
			? new SQS(SQSOrSQSConfiguration.getConnectionObject())
			: SQSOrSQSConfiguration;
		this._queueURL = queueURL;
		this._waitTimeSeconds = waitTimeSeconds || 20;
		this._handleMessageTimeout = handleMessageTimeout;
		this._authenticationErrorTimeout = setNumberToDefaultIfNotProvided(authenticationErrorTimeout, 10000);
		this._attributeNames = attributeNames || [];
		this._messageAttributeNames = messageAttributeNames || [];
		if (terminateVisibilityTimeout)
			console.warn(
				`By using the terminateVisibilityTimeout options you set the message visibility equal to zero. This might cause unexpected behavior (messages being received multiple times in the same request). For more details, see: https://github.com/aws/aws-sdk-java/issues/705`,
			);
		this._isTerminateVisibilityTimeout = terminateVisibilityTimeout || false;
		this._batchSize = batchSize || 1;
		this._visibilityTimeout = setNumberToDefaultIfNotProvided(visibilityTimeout, 30);
		this._pollingTimeout = setNumberToDefaultIfNotProvided(pollingTimeout, 0);
		this._handleMessage = handleMessage;
		this._handleMessageBatch = handleMessageBatch;

		autoBind(this);
	}

	public start(): void {
		if (this._stopped) {
			this._stopped = false;
			this.poll();
			this.emit('started');
		}
	}

	public stop(): void {
		this._stopped = true;
	}

	public get isRunning(): boolean {
		return !this._stopped;
	}

	public get isProcessing(): boolean {
		return this._isPollingOrProcessing;
	}

	private poll(): void {
		if (this._stopped) {
			if (this._timer) clearTimeout(this._timer);
			this.emit('stopped');
			return undefined;
		}

		this._isPollingOrProcessing = true;

		const receiveParams = {
			QueueUrl: this._queueURL,
			AttributeNames: this._attributeNames,
			MessageAttributeNames: this._messageAttributeNames,
			MaxNumberOfMessages: this._batchSize,
			WaitTimeSeconds: this._waitTimeSeconds,
			VisibilityTimeout: this._visibilityTimeout,
		};

		let currentPollTimeout = this._pollingTimeout;
		this._receiveMessage(receiveParams)
			.then(this._handleSQSResponse)
			.catch((err) => {
				this.emit('error', err);
				if (this._isConnectionError(err)) {
					console.warn('There was an authentication error. Pausing before retrying.');
					currentPollTimeout = this._authenticationErrorTimeout;
				}
			})
			.then(() => {
				this._timer = setTimeout(this.poll, currentPollTimeout);
			})
			.catch((err) => {
				this.emit('error', err);
			})
			.finally(() => {
				this._isPollingOrProcessing = false;
			});
	}

	private async _receiveMessage(params: ReceiveMessageRequest): Promise<ReceiveMessageResponse> {
		try {
			const messages = await this._SQS.receiveMessage(params).promise();
			return messages;
		} catch (err) {
			throw this._toSQSError(err, `SQS receive message failed: ${err.message}`);
		}
	}

	private _isConnectionError(err: Error): boolean {
		return err instanceof SQSError
			? err.statusCode === 403 || err.code === 'CredentialsError' || err.code === 'UnknownEndpoint'
			: false;
	}

	private async _handleSQSResponse(response: ReceiveMessageResponse): Promise<void> {
		if (!response) return undefined;
		// check if there actually are messages
		if (!(!!response.Messages && response.Messages.length > 0)) {
			this.emit('empty');
			return undefined;
		}

		if (this._handleMessageBatch) {
			// prefer handling messages in batch when available
			await this._processMessageBatch(response.Messages);
		} else {
			await Promise.all(response.Messages.map(this.processMessage));
		}
		this.emit('response_processed');
	}

	private async _processMessageBatch(messages: SQSMessage[]): Promise<void> {
		messages.forEach((message) => {
			this.emit('message_received', message);
		});

		try {
			await this._executeBatchHandler(messages);
			await this._deleteMessageBatch(messages);
			messages.forEach((message) => {
				this.emit('message_processed', message);
			});
		} catch (err) {
			this.emit('error', err, messages);
			if (this._isTerminateVisibilityTimeout) {
				try {
					await this._terminateVisibilityTimeoutBatch(messages);
				} catch (err) {
					this.emit('error', err, messages);
				}
			}
		}
	}

	private async _executeBatchHandler(messages: SQSMessage[]): Promise<void> {
		if (!this._handleMessageBatch)
			throw new Error('You must provide a batch message handler, i.e. handleMessageBatch');

		try {
			await this._handleMessageBatch(messages);
		} catch (err) {
			throw this._toSQSError(err, `Unexpected message handler failure: ${err.message}`);
		}
	}

	private async _deleteMessageBatch(messages: SQSMessage[]): Promise<void> {
		const deleteParams: SQS.DeleteMessageBatchRequest = {
			QueueUrl: this._queueURL,
			Entries: messages
				.map((message) => {
					if (message.MessageId && message.ReceiptHandle)
						return {
							Id: message.MessageId,
							ReceiptHandle: message.ReceiptHandle,
						};
					return undefined;
				})
				.filter((entries) => !!entries) as SQS.Types.DeleteMessageBatchRequestEntryList,
		};

		try {
			await this._SQS.deleteMessageBatch(deleteParams).promise();
		} catch (err) {
			throw this._toSQSError(err, `SQS delete message failed: ${err.message}`);
		}
	}

	private async _terminateVisibilityTimeoutBatch(messages: SQSMessage[]): Promise<PromiseResult<any, AWSError>> {
		const params: SQS.Types.ChangeMessageVisibilityBatchRequest = {
			QueueUrl: this._queueURL,
			Entries: messages
				.map((message) => {
					if (!message) return undefined;
					return {
						Id: message.MessageId,
						ReceiptHandle: message.ReceiptHandle,
						VisibilityTimeout: 0,
					};
				})
				.filter((message) => !!message) as SQS.Types.ChangeMessageVisibilityBatchRequestEntry[],
		};

		return this._SQS.changeMessageVisibilityBatch(params).promise();
	}

	private async processMessage(message: SQSMessage): Promise<void> {
		this.emit('message_received', message);

		try {
			await this._executeHandler(message);
			await this._deleteMessage(message);
			this.emit('message_processed', message);
		} catch (err) {
			this._emitError(err, message);
			if (this._isTerminateVisibilityTimeout) {
				try {
					await this._terminateVisibilityTimeout(message);
				} catch (error) {
					this.emit('error', err, message);
				}
			}
		}
	}

	private async _executeHandler(message: SQSMessage): Promise<void> {
		if (!this._handleMessage)
			throw new Error('You must provide a message handler for handling individual messages, i.e. handleMessage.');

		try {
			if (this._handleMessageTimeout) {
				await this._handleMessageOrTimeout(
					async () => (this._handleMessage as MessageHandler)(message),
					this._handleMessageTimeout,
				);
			} else {
				await this._handleMessage(message);
			}
		} catch (err) {
			if (err instanceof TimeoutError) {
				err.message = `Message handler timed out after ${this._handleMessageTimeout}ms: Operation timed out.`;
			} else {
				err.message = `Unexpected message handler failure: ${err.message}`;
			}
			throw err;
		}
	}

	private async _deleteMessage(message: SQSMessage): Promise<void> {
		if (!message.ReceiptHandle)
			throw new Error(
				`Could not delete message because the message ReceiptHandle does not exist for message with ID: ${message.MessageId}`,
			);
		const deleteParams = {
			QueueUrl: this._queueURL,
			ReceiptHandle: message.ReceiptHandle,
		};

		try {
			await this._SQS.deleteMessage(deleteParams).promise();
		} catch (err) {
			throw this._toSQSError(err, `SQS delete message failed: ${err.message}`);
		}
	}

	private _emitError(err: Error, message: SQSMessage): void {
		if (err.name === SQSError.name) {
			this.emit('error', err, message);
		} else if (err instanceof TimeoutError) {
			this.emit('timeout_error', err, message);
		} else {
			this.emit('processing_error', err, message);
		}
	}

	private async _terminateVisibilityTimeout(message: SQSMessage): Promise<PromiseResult<any, AWSError>> {
		if (!message.ReceiptHandle)
			throw new Error(
				`Message does not provide a ReceiptHandle which is required to change the message visibility (this._SQS.changeMessageVisibility()). Message ID: ${message.MessageId}`,
			);

		const params: SQS.ChangeMessageVisibilityRequest = {
			QueueUrl: this._queueURL,
			ReceiptHandle: message.ReceiptHandle,
			VisibilityTimeout: 0,
		};

		return this._SQS.changeMessageVisibility(params).promise();
	}

	private async _handleMessageOrTimeout(handleMessage: () => Promise<void>, timeout: number): Promise<void> {
		let timer: NodeJS.Timeout;
		const pending = new Promise<void>((_, reject) => {
			timer = setTimeout(() => reject(new TimeoutError()), timeout);
		});

		return Promise.race([pending, handleMessage()]).finally(() => clearTimeout(timer));
	}

	private _toSQSError(AWSError: AWSError, message: string): SQSError {
		const aSQSError = new SQSError(AWSError, message);
		return aSQSError;
	}
}
