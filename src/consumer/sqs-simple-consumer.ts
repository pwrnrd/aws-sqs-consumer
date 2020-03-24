import { SQS } from 'aws-sdk';
import { SQSConsumer } from './sqs-queue-consumer';
import { SQSConfiguration } from '../sqs-configuration';
import { SQSMessage } from './sqs-message';

const notListeningToQueueError = new Error('To start listening for messages first attach the listener to a queue');

/** A SQSQueueConsumer with some logical defaults and error logging */
export class SQSSimpleConsumer {
	private _queueURL: string;

	private _SQSOrSQSConfiguration?: SQS | SQSConfiguration;

	private _queue?: SQSConsumer;

	private _filteredDispatch: (messages: SQSMessage[]) => Promise<void>;

	constructor(
		filteredDispatch: (messages: SQSMessage[]) => Promise<void>,
		queueURL: string,
		SQSOrSQSConfiguration?: SQS | SQSConfiguration,
	) {
		this._queueURL = queueURL;
		this._SQSOrSQSConfiguration = SQSOrSQSConfiguration;
		this._filteredDispatch = filteredDispatch;

		this._attachToQueue();
		if (!this._queue) throw notListeningToQueueError;
		this._startLoggingQueueEvents();
		this.start();
	}

	private _attachToQueue(): void {
		this._queue = new SQSConsumer(
			this._queueURL,
			{
				handleMessageBatch: this._filteredDispatch,
				pollingTimeout: 0,
				batchSize: 10,
			},
			this._SQSOrSQSConfiguration,
		);
	}

	private _startLoggingQueueEvents(): void {
		if (!this._queue) throw notListeningToQueueError;
		this._queue.on('started', () => console.log('Started listening for message on ', this._queueURL));
		this._queue.on('stopped', () => console.log('Stopped listening for message on ', this._queueURL));
		this._queue.on('error', (error, messages) =>
			console.error(
				'Error listening to queue: ',
				this._queueURL,
				'\n',
				'Error:',
				error,
				'\n',
				'Messages:',
				JSON.stringify(messages, null, 2),
			),
		);
		this._queue.on('processing_error', (error, messages) =>
			console.error(
				'Processing Error on queue: ',
				this._queueURL,
				'\n',
				'Error:',
				error,
				'\n',
				'Messages:',
				JSON.stringify(messages, null, 4),
			),
		);
		this._queue.on('timeout_error', (error) =>
			console.warn('Timeout Error listening to queue: ', this._queueURL, '\n', 'Error:', error),
		);
	}

	public start(): void {
		if (!this._queue) throw notListeningToQueueError;
		this._queue.start();
	}

	public stop(): void {
		if (!this._queue) throw notListeningToQueueError;
		this._queue.stop();
	}

	public get isListening(): boolean {
		if (!this._queue) throw notListeningToQueueError;
		return this._queue.isRunning;
	}

	public get queueURL(): string {
		return this._queueURL;
	}
}
