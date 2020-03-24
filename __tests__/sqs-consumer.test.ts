import { SQS } from 'aws-sdk';
import { SQSConsumer } from '../src/consumer/sqs-queue-consumer';
import { CustomAWSError, SQSError } from '../src/consumer/sqs-errors';
import { SQSConfiguration } from '../src/sqs-configuration';
import * as fakes from './fakes';
import { SQSAWSRegions } from '../src/aws-regions';

describe('SQS Consumer', () => {
	let SQS: SQS;
	let consumer: SQSConsumer;
	let aSQSConfiguration: SQSConfiguration;
	let AWSErrorProps: CustomAWSError;
	let mockedReceiveMessageResponse: fakes.IMockedReceiveMessageResponse;
	let MockedSQS: jest.Mock<SQS, [SQSConfiguration]>;

	const mockedPromiseResolve = (resolveValue: any) =>
		jest.fn((): any => ({ promise: () => Promise.resolve(resolveValue) }));
	const mockedPromiseReject = (
		rejectionValue: Error | { code: string; message: string } | { statusCode: number; message: string },
	) => jest.fn((): any => ({ promise: () => Promise.reject(rejectionValue) }));

	let handleMessageResolve: jest.Mock<Promise<void>>;

	describe('Initialization', () => {
		test('Can create a new SQS Consumer using SQSConfiguration', () => {
			expect(
				() =>
					new SQSConsumer(
						'test',
						{
							handleMessage: jest.fn(() => Promise.resolve()),
						},
						new SQSConfiguration({
							region: fakes.region,
							accessKeyID: 'test',
							secretAccessKey: 'test',
						}),
					),
			).not.toThrow();
		});

		test('Can create a new SQS Consumer using environment variables', () => {
			process.env.AWS_REGION = 'eu-west-1';
			process.env.AWS_ACCESS_KEY_ID = 'test';
			process.env.AWS_SECRET_ACCESS_KEY = 'test';
			expect(
				() =>
					new SQSConsumer('test', {
						handleMessage: jest.fn(() => Promise.resolve()),
					}),
			).not.toThrow();
			delete process.env.AWS_REGION;
			delete process.env.AWS_ACCESS_KEY_ID;
			delete process.env.SECRET_ACCESS_KEY;
		});
	});

	describe('Post-Initialization', () => {
		beforeEach(() => {
			mockedReceiveMessageResponse = fakes.mockedReceiveMessageResponse;
			MockedSQS = fakes.MockedSQS;

			aSQSConfiguration = new SQSConfiguration({
				region: SQSAWSRegions['us-east-1'],
				accessKeyID: 'test',
				secretAccessKey: 'test',
			});

			SQS = new MockedSQS(aSQSConfiguration);

			AWSErrorProps = {
				name: 'SQSError',
				message: 'original error',
				code: 'short code',
				retryable: false,
				statusCode: 403,
				time: new Date(0),
				hostname: 'test',
				region: 'test',
			};

			handleMessageResolve = jest.fn(() => Promise.resolve());

			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: handleMessageResolve,
				},
				SQS,
			);
		});

		test('requies a handleMessage or handleMessageBatch function to be set', () => {
			expect(() => new SQSConsumer(fakes.queueURL, {})).toThrowError(/batch or individual message handler/);
		});

		test('requires the batchSize option to be no g, SQSreater than 10', () => {
			expect(
				() =>
					new SQSConsumer(
						fakes.queueURL,
						{
							handleMessage: handleMessageResolve,
							batchSize: 11,
						},
						SQS,
					),
			).toThrowError(/batch size/);
		});

		test('requires the batchSize option to be no smaller than 1', () => {
			expect(
				() =>
					new SQSConsumer(
						fakes.queueURL,
						{
							handleMessage: handleMessageResolve,
							batchSize: 0,
						},
						SQS,
					),
			).toThrowError(/batch size/);
			expect(
				() =>
					new SQSConsumer(
						fakes.queueURL,
						{
							handleMessage: handleMessageResolve,
							batchSize: -1,
						},
						SQS,
					),
			).toThrowError(/batch size/);
		});

		test('Allows batchSize to be in the range [1,10]', () => {
			expect(
				() =>
					new SQSConsumer(
						fakes.queueURL,
						{
							handleMessage: handleMessageResolve,
							batchSize: 5,
						},
						SQS,
					),
			).not.toThrow();
		});

		test('fires an error event when an error occurs receiving a message', async (done) => {
			// todo possible delete the any return type from the innerfunction of jest.fn
			SQS.receiveMessage = mockedPromiseReject(new Error('Receive error'));

			consumer.on('error', (val) => {
				expect(val.message).toEqual('SQS receive message failed: Receive error');
				consumer.stop();
				done();
			});
			consumer.start();
		});

		test('Creates an SQS error', () => {
			const customMessage = 'custom test message';
			const err = new SQSError(AWSErrorProps, customMessage);
			const { message, ...otherAWSErrorProps } = AWSErrorProps;
			const partialResult = {
				...otherAWSErrorProps,
				originalMessage: message,
			};
			expect({
				name: err.name,
				originalMessage: err.originalMessage,
				code: err.code,
				statusCode: err.statusCode,
				region: err.region,
				hostname: err.hostname,
				time: err.time,
				retryable: err.retryable,
			}).toEqual(partialResult);
			expect(err.message).toBe(customMessage);
		});

		test('retains SQS error information', async (done) => {
			const customMessage = 'custom test message';
			const receivedError = new SQSError(AWSErrorProps, customMessage);
			SQS.receiveMessage = mockedPromiseReject(receivedError);
			const consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: handleMessageResolve,
				},
				SQS,
			);

			consumer.on('error', (val) => {
				expect(val.message).toBe(`SQS receive message failed: ${customMessage}`);
				expect(val.originalMessage).toBe(customMessage); // Note, we have an AWSErrorProps.message as well, but this get's overriden by the custom message when actually throwing the error.
				expect(val.code).toBe(AWSErrorProps.code);
				expect(val.retryable).toBe(AWSErrorProps.retryable);
				expect(val.statusCode).toBe(AWSErrorProps.statusCode);
				expect(val.time).toBe(AWSErrorProps.time);
				expect(val.hostname).toBe(AWSErrorProps.hostname);
				expect(val.region).toBe(AWSErrorProps.region);
				consumer.stop();
				done();
			});
			consumer.start();
		});

		test('fires a timeout event if handler function takes too long', async (done) => {
			const handleMessageTimeout = 500;
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: jest.fn(() => new Promise((resolve) => setTimeout(resolve, 1000))),
					handleMessageTimeout,
					authenticationErrorTimeout: 20,
				},
				SQS,
			);

			consumer.on('timeout_error', (val) => {
				expect(val.message).toBe(
					`Message handler timed out after ${handleMessageTimeout}ms: Operation timed out.`,
				);
				consumer.stop();
				done();
			});
			consumer.start();
		});

		test('Processes the message if the message handler completes before the timeout', async (done) => {
			const handleMessageTimeout = 500;
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: jest.fn(() => new Promise((resolve) => setTimeout(resolve, 250))),
					handleMessageTimeout,
					authenticationErrorTimeout: 20,
				},
				SQS,
			);

			consumer.on('message_processed', (val) => {
				expect(val).toEqual(mockedReceiveMessageResponse.Messages[0]);
				consumer.stop();
				done();
			});

			consumer.start();
		});

		test('handles unexpected exceptions thrown by the handler function', async (done) => {
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: () => {
						throw new Error('unexpected parsing error');
					},
					authenticationErrorTimeout: 20,
				},
				SQS,
			);

			consumer.on('processing_error', (val) => {
				expect(val.message).toEqual('Unexpected message handler failure: unexpected parsing error');
				consumer.stop();
				done();
			});

			consumer.start();
		});

		test('fires an error event when an error occurs deleting a message', async (done) => {
			const deleteErrorMessage = 'Delete error';
			const deleteError = new Error(deleteErrorMessage);
			SQS.deleteMessage = mockedPromiseReject(deleteError);

			consumer.on('error', (val) => {
				expect(val.message).toBe(`SQS delete message failed: ${deleteErrorMessage}`);
				consumer.stop();
				done();
			});

			consumer.start();
		});

		test('fires a `processing_error` event when a non-`SQSError` error occurs processing a message', async (done) => {
			const processingError = new Error('Processing error');

			const consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: jest.fn(() => Promise.reject(processingError)),
				},
				SQS,
			);

			consumer.on('processing_error', (...val) => {
				const [error, message] = val;
				expect(error.message).toBe('Unexpected message handler failure: Processing error');
				expect(message.MessageId).toBe('123');
				consumer.stop();
				done();
			});
			consumer.start();
		});

		test('fires an `error` event when an `SQSError` occurs processing a message', async (done) => {
			const aSQSError = new Error('Processing error');
			SQS.deleteMessage = mockedPromiseReject(aSQSError);

			consumer.on('error', (...val) => {
				const [error, message] = val;
				expect(error.message).toBe('SQS delete message failed: Processing error');
				expect(error instanceof SQSError).toBe(true);
				expect(message.MessageId).toBe('123');
				consumer.stop();
				done();
			});
			consumer.start();
		});

		test('waits before repolling when a credentials error occurs', async (done) => {
			const credentialsErr = {
				code: 'CredentialsError',
				message: 'Missing credentials in config',
			};
			SQS.receiveMessage = mockedPromiseReject(credentialsErr);

			const authenticationErrorTimeout = 20;
			const consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: handleMessageResolve,
					authenticationErrorTimeout,
				},
				SQS,
			);

			const timings: number[] = [];
			const updateTimings = () => timings.push(new Date().getTime());
			const onErrorCallback = jest
				.fn()
				.mockImplementationOnce(updateTimings)
				.mockImplementationOnce(updateTimings)
				.mockImplementationOnce(consumer.stop);

			consumer.on('error', onErrorCallback);
			consumer.on('stopped', () => {
				expect(SQS.receiveMessage).toHaveBeenCalledTimes(3);
				expect(timings[1] - timings[0]).toBeGreaterThanOrEqual(authenticationErrorTimeout);
				done();
			});
			consumer.start();
		});

		test('waits before repolling when a polling timeout has been set', () => {
			return new Promise((done) => {
				const pollingTimeout = 50;
				const consumer = new SQSConsumer(
					fakes.queueURL,
					{
						handleMessage: handleMessageResolve,
						pollingTimeout,
					},
					SQS,
				);
				const timings: number[] = [];
				const updateTimings = () => timings.push(new Date().getTime());
				const onMessageReceivedCallback = jest
					.fn()
					.mockImplementationOnce(updateTimings)
					.mockImplementationOnce(updateTimings)
					.mockImplementationOnce(updateTimings)
					.mockImplementationOnce(consumer.stop);

				consumer.on('message_received', onMessageReceivedCallback);

				consumer.start();

				consumer.on('stopped', () => {
					expect(SQS.receiveMessage).toHaveBeenCalledTimes(4);
					expect(timings[1] - timings[0]).toBeGreaterThanOrEqual(pollingTimeout);
					expect(timings[2] - timings[1]).toBeGreaterThanOrEqual(pollingTimeout);
					done();
				});
			});
		});

		test('waits before repolling when a 403 error occurs', async (done) => {
			const invalidSignatureErr = {
				statusCode: 403,
				message: 'The security token included in the request is invalid',
			};
			SQS.receiveMessage = mockedPromiseReject(invalidSignatureErr);
			const authenticationErrorTimeout = 20;

			const consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: handleMessageResolve,
					authenticationErrorTimeout,
				},
				SQS,
			);

			const timings: number[] = [];
			const updateTimings = () => timings.push(new Date().getTime());

			const errorListener = jest
				.fn()
				.mockImplementationOnce(updateTimings)
				.mockImplementationOnce(updateTimings)
				.mockImplementationOnce(() => {
					consumer.stop();
				});

			consumer.on('error', errorListener);
			consumer.on('stopped', () => {
				expect(SQS.receiveMessage).toHaveBeenCalledTimes(3);
				expect(timings[1] - timings[0]).toBeGreaterThan(authenticationErrorTimeout);
				done();
			});
			consumer.start();
		});

		test('waits before repolling when a UnknownEndpoint error occurs', async (done) => {
			const unknownEndpointErr = {
				code: 'UnknownEndpoint',
				message:
					'Inaccessible host: `sqs.eu-west-1.amazonaws.com`. This service may not be available in the `eu-west-1` region.',
			};
			SQS.receiveMessage = mockedPromiseReject(unknownEndpointErr);

			const authenticationErrorTimeout = 20;

			const consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: handleMessageResolve,
					authenticationErrorTimeout,
				},
				SQS,
			);

			const timings: number[] = [];
			const updateTimings = () => timings.push(new Date().getTime());

			const errorListener = jest
				.fn()
				.mockImplementationOnce(updateTimings)
				.mockImplementationOnce(updateTimings)
				.mockImplementationOnce(() => {
					consumer.stop();
				});

			consumer.on('error', errorListener);
			consumer.on('stopped', () => {
				expect(SQS.receiveMessage).toHaveBeenCalledTimes(3);
				expect(timings[1] - timings[0]).toBeGreaterThan(authenticationErrorTimeout);
				done();
			});

			consumer.start();
		});

		test('fires a message_received event when a message is received', async (done) => {
			consumer.on('message_processed', (value) => {
				consumer.stop();
				expect(value).toEqual(mockedReceiveMessageResponse.Messages[0]);
				expect(SQS.deleteMessage).toBeCalledTimes(1);
				done();
			});
			consumer.start();
		});

		test('fires a message_processed event when a message is successfully deleted', async (done) => {
			consumer.on('message_processed', (value) => {
				consumer.stop();
				expect(SQS.deleteMessage).toHaveBeenCalledTimes(1);
				expect(value).toEqual(mockedReceiveMessageResponse.Messages[0]);
				done();
			});

			consumer.start();
		});

		test('calls the handleMessage function when a message is received', async (done) => {
			consumer.on('message_processed', (value) => {
				consumer.stop();
				expect(handleMessageResolve).toHaveBeenCalledTimes(1);
				done();
			});
			consumer.start();
		});

		test('deletes the message when the handleMessage function is called', async (done) => {
			consumer.on('message_processed', () => {
				consumer.stop();
				expect(handleMessageResolve).toHaveBeenCalledTimes(1);
				expect(SQS.deleteMessage).toHaveBeenCalledTimes(1);
				done();
			});
			consumer.start();
		});

		test('does not delete the message when a processing error is reported', async (done) => {
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: jest.fn(() => Promise.reject(new Error('Processing error'))),
				},
				SQS,
			);

			consumer.on('processing_error', () => {
				consumer.stop();
				expect(SQS.deleteMessage).toBeCalledTimes(0);
				done();
			});
			consumer.start();
		});

		test('consumes another message once one is processed', async (done) => {
			const newMockedReceiveMessageResponse: fakes.IMockedReceiveMessageResponse = {
				Messages: [mockedReceiveMessageResponse.Messages[0], mockedReceiveMessageResponse.Messages[0]],
			};
			SQS.receiveMessage = mockedPromiseResolve(newMockedReceiveMessageResponse);

			consumer.on('message_processed', () => {
				consumer.stop();
				expect(handleMessageResolve).toHaveBeenCalledTimes(2);
				done();
			});
			consumer.start();
		});

		test('does not consume more messages when called multiple times', () => {
			SQS.receiveMessage = jest.fn((): any => ({
				promise: () => new Promise((resolve) => setTimeout(() => resolve(mockedReceiveMessageResponse), 100)),
			}));
			consumer.start();
			consumer.start();
			consumer.start();
			consumer.start();
			consumer.start();
			consumer.stop();
			expect(SQS.receiveMessage).toHaveBeenCalledTimes(1);
		});

		test('consumes multiple messages when the batchSize is greater than 1', async (done) => {
			SQS.receiveMessage = mockedPromiseResolve({
				Messages: [
					{
						ReceiptHandle: 'receipt-handle-1',
						MessageId: '1',
						Body: 'body-1',
					},
					{
						ReceiptHandle: 'receipt-handle-2',
						MessageId: '2',
						Body: 'body-2',
					},
					{
						ReceiptHandle: 'receipt-handle-3',
						MessageId: '3',
						Body: 'body-3',
					},
				],
			});

			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					messageAttributeNames: ['attribute-1', 'attribute-2'],
					handleMessage: handleMessageResolve,
					batchSize: 3,
				},
				SQS,
			);

			consumer.on('response_processed', () => {
				consumer.stop();
				expect(SQS.receiveMessage).toHaveBeenCalledWith({
					QueueUrl: fakes.queueURL,
					AttributeNames: [],
					MessageAttributeNames: ['attribute-1', 'attribute-2'],
					MaxNumberOfMessages: 3,
					WaitTimeSeconds: 20,
					VisibilityTimeout: 30,
				});
				expect(handleMessageResolve).toHaveBeenCalledTimes(3);
				done();
			});
			consumer.start();
		});

		test('consumes messages with message attribute "ApproximateReceiveCount"', async (done) => {
			const messageWithAttr = {
				ReceiptHandle: 'receipt-handle-1',
				MessageId: '1',
				Body: 'body-1',
				Attributes: {
					ApproximateReceiveCount: 1,
				},
			};

			SQS.receiveMessage = mockedPromiseResolve({
				Messages: [messageWithAttr],
			});

			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					attributeNames: ['ApproximateReceiveCount'],
					handleMessage: handleMessageResolve,
				},
				SQS,
			);

			consumer.on('message_received', (value) => {
				consumer.stop();
				expect(SQS.receiveMessage).toHaveBeenCalledWith({
					QueueUrl: fakes.queueURL,
					AttributeNames: ['ApproximateReceiveCount'],
					MessageAttributeNames: [],
					MaxNumberOfMessages: 1,
					WaitTimeSeconds: 20,
					VisibilityTimeout: 30,
				});
				expect(value).toEqual(messageWithAttr);
				done();
			});
			consumer.start();
		});

		test('fires an emptyQueue event when all messages have been consumed', async (done) => {
			SQS.receiveMessage = mockedPromiseResolve({});

			consumer.on('empty', () => {
				consumer.stop();
				expect(handleMessageResolve).toHaveBeenCalledTimes(0);
				expect(SQS.receiveMessage).toHaveBeenCalledTimes(1);
				done();
			});

			consumer.start();
		});

		test('terminate message visibility timeout on processing error', async (done) => {
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: jest.fn(() => Promise.reject(new Error('Processing error'))),
					terminateVisibilityTimeout: true,
				},
				SQS,
			);

			consumer.on('response_processed', () => {
				consumer.stop();
				expect(SQS.changeMessageVisibility).toHaveBeenCalledWith({
					QueueUrl: fakes.queueURL,
					ReceiptHandle: 'receipt-handle',
					VisibilityTimeout: 0,
				});
				done();
			});
			consumer.start();
		});

		test('does not terminate visibility timeout when `terminateVisibilityTimeout` option is false', async (done) => {
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: jest.fn(() => Promise.reject(new Error('Processing error'))),
					terminateVisibilityTimeout: false,
				},
				SQS,
			);

			consumer.on('response_processed', () => {
				consumer.stop();
				expect(SQS.changeMessageVisibility).toHaveBeenCalledTimes(0);
				done();
			});
			consumer.start();
		});

		test('fires error event when failed to terminate visibility timeout on processing error', async (done) => {
			const SQSError = new Error('Processing error');
			SQSError.name = 'SQSError';
			SQS.changeMessageVisibility = mockedPromiseReject(SQSError);

			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					handleMessage: jest.fn(() => Promise.reject(new Error('Processing error'))),
					terminateVisibilityTimeout: true,
				},
				SQS,
			);

			consumer.on('error', () => {
				consumer.stop();
				expect(SQS.changeMessageVisibility).toHaveBeenCalledWith({
					QueueUrl: fakes.queueURL,
					ReceiptHandle: 'receipt-handle',
					VisibilityTimeout: 0,
				});
				done();
			});

			consumer.start();
		});

		test('fires response_processed event for each batch', async (done) => {
			SQS.receiveMessage = jest
				.fn()
				.mockImplementationOnce(() => ({
					promise: () =>
						Promise.resolve({
							Messages: [
								{
									ReceiptHandle: 'receipt-handle-1',
									MessageId: '1',
									Body: 'body-1',
								},
							],
						}),
				}))
				.mockImplementationOnce(() => ({
					promise: () =>
						Promise.resolve({
							Messages: [
								{
									ReceiptHandle: 'receipt-handle-2',
									MessageId: '2',
									Body: 'body-2',
								},
							],
						}),
				}));

			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					messageAttributeNames: ['attribute-1', 'attribute-2'],
					handleMessage: handleMessageResolve,
					batchSize: 1,
					pollingTimeout: 0,
				},
				SQS,
			);

			let responseProcessCalled = 0;
			consumer.on('response_processed', () => {
				responseProcessCalled += 1;
				if (responseProcessCalled === 2) {
					consumer.stop();
					expect(responseProcessCalled).toBe(2);
					done();
				}
			});
			consumer.start();
		});

		test('calls the handleMessagesBatch function when a batch of messages is received', async (done) => {
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					messageAttributeNames: ['attribute-1', 'attribute-2'],
					handleMessageBatch: handleMessageResolve,
					batchSize: 2,
				},
				SQS,
			);

			consumer.on('response_processed', () => {
				consumer.stop();
				expect(handleMessageResolve).toHaveBeenCalledTimes(1);
				done();
			});
			consumer.start();
		});

		test('prefers handleMessagesBatch over handleMessage when both are set', async (done) => {
			const handleMessageBatch = jest.fn();
			consumer = new SQSConsumer(
				fakes.queueURL,
				{
					messageAttributeNames: ['attribute-1', 'attribute-2'],
					handleMessageBatch,
					handleMessage: handleMessageResolve,
					batchSize: 2,
				},
				SQS,
			);

			consumer.on('response_processed', () => {
				consumer.stop();
				expect(handleMessageBatch).toHaveBeenCalledTimes(1);
				expect(handleMessageResolve).toHaveBeenCalledTimes(0);
				done();
			});
			consumer.start();
		});

		describe('.stop', () => {
			test('stops the consumer polling for messages', async (done) => {
				consumer.on('stopped', () => {
					done();
				});
				consumer.start();
				consumer.stop();
			});

			test('fires a stopped event when last poll occurs after stopping', async (done) => {
				consumer.on('stopped', () => {
					expect(handleMessageResolve).toHaveBeenCalledTimes(1);
					done();
				});
				consumer.start();
				consumer.stop();
			});

			test('fires a stopped event only once when stopped multiple times', async (done) => {
				const handleStop = jest.fn();

				consumer.on('stopped', handleStop);

				consumer.start();
				consumer.stop();
				consumer.stop();
				consumer.stop();

				setTimeout(() => {
					expect(handleStop).toHaveBeenCalledTimes(1);
					done();
				}, 10);
			});

			test('fires a stopped event a second time if started and stopped twice', async (done) => {
				const sleep = async () => await new Promise((resolve) => setTimeout(resolve, 10));

				const handleStop = jest.fn();
				consumer.on('stopped', handleStop);

				consumer.start();
				consumer.stop();

				if (consumer.isProcessing) await sleep();

				consumer.start();
				consumer.stop();

				if (consumer.isProcessing) await sleep();

				expect(handleStop).toHaveBeenCalledTimes(2);
				done();
			});
		});

		describe('isRunning', () => {
			test('returns true if the consumer is polling', () => {
				consumer.start();
				expect(consumer.isRunning).toBe(true);
				consumer.stop();
			});

			it('returns false if the consumer is not polling', () => {
				consumer.start();
				consumer.stop();
				expect(consumer.isRunning).toBe(false);
			});
		});
	});
});
