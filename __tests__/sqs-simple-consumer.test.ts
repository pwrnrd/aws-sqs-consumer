import { SQS } from 'aws-sdk';
import { SQSConfiguration, SQSSimpleConsumer, SQSMessage, SQSAWSRegions } from '../src';
import * as fakes from './fakes';

describe('SQS Listener', () => {
	let aSimpleConsumer: SQSSimpleConsumer;
	let useCase: jest.Mock<Promise<void>, [SQSMessage]>;
	let aSQSConfiguration: SQSConfiguration;
	let aSQS: SQS;
	let mockedReceiveMessageResponse: fakes.IMockedReceiveMessageResponse;

	class FilteredDispatcher {
		public static async filteredDispatch(messages: SQSMessage[]): Promise<void> {
			await Promise.all(
				messages.map((message) => {
					useCase(message);
				}),
			);
		}
	}

	beforeEach(() => {
		mockedReceiveMessageResponse = {
			Messages: [
				{
					ReceiptHandle: 'receipt-handle',
					MessageId: '1',
					Body: {
						name: 'test1',
						type: 'amazonOrder',
						occurredOn: new Date(0),
					},
				},
				{
					ReceiptHandle: 'receipt-handle',
					MessageId: '2',
					Body: {
						name: 'test2',
						type: 'amazonOrder',
						occurredOn: new Date(0),
					},
				},
			],
		};
		useCase = jest.fn(async (message: SQSMessage): Promise<void> => Promise.resolve());

		aSQSConfiguration = new SQSConfiguration({
			region: SQSAWSRegions['us-east-1'],
			accessKeyID: 'test',
			secretAccessKey: 'test',
		});
		aSQS = new fakes.MockedSQS(aSQSConfiguration);
		aSQS.receiveMessage = jest
			.fn()
			.mockImplementationOnce(() => ({
				promise: () => Promise.resolve(mockedReceiveMessageResponse),
			}))
			.mockImplementation(() => ({
				promise: () => Promise.resolve(),
			}));

		aSimpleConsumer = new SQSSimpleConsumer(FilteredDispatcher.filteredDispatch, fakes.queueURL, aSQS);
		aSimpleConsumer.stop();
	});

	test('Starts the queue when initiating the listener', () => {
		aSimpleConsumer = new SQSSimpleConsumer(FilteredDispatcher.filteredDispatch, fakes.queueURL, aSQS);
		expect(aSimpleConsumer.isListening).toBe(true);
	});

	test('Stops the queue when stopped listening', () => {
		aSimpleConsumer.start();
		expect(aSimpleConsumer.isListening).toBe(true);
		aSimpleConsumer.stop();
		expect(aSimpleConsumer.isListening).toBe(false);
	});

	test('Calls the useCase with messages', async (done) => {
		setTimeout(() => {
			expect(useCase).toHaveBeenCalledTimes(2);
			expect(useCase).toHaveBeenNthCalledWith(1, mockedReceiveMessageResponse.Messages[0]);
			expect(useCase).toHaveBeenLastCalledWith(mockedReceiveMessageResponse.Messages[1]);
			done();
		}, 50);
	});

	test('Returns the queueName', () => {
		expect(aSimpleConsumer.queueURL).toEqual(fakes.queueURL);
	});
});
