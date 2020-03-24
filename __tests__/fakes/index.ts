import { SQS } from 'aws-sdk';
import { SQSConfiguration } from '../../src/sqs-configuration';
import { SQSAWSRegions } from '../../src/aws-regions';

export interface IMockedReceiveMessageResponse {
	Messages: {
		ReceiptHandle: string;
		MessageId: string;
		Body: string | object;
	}[];
}
export type MockedSQS = jest.Mock<SQS, [SQSConfiguration]>;
export type MockedHandleMessage = jest.Mock<Promise<void>>;

export const mockedPromiseResolve = (resolveValue: any) =>
	jest.fn((): any => ({ promise: () => Promise.resolve(resolveValue) }));
export const mockedPromiseReject = (
	rejectionValue: Error | { code: string; message: string } | { statusCode: number; message: string },
) => jest.fn((): any => ({ promise: () => Promise.reject(rejectionValue) }));

export const mockedReceiveMessageResponse: IMockedReceiveMessageResponse = {
	Messages: [
		{
			ReceiptHandle: 'receipt-handle',
			MessageId: '123',
			Body: 'body',
		},
	],
};

const mockedPublishMessageResponse = { Failed: [] };

export const queueURL = 'https://sqs.eu-west-1.amazonaws.com/000111222333/amazonTestQueue';

export const region = SQSAWSRegions['eu-west-1'];

export const MockedSQS: MockedSQS = jest.fn<SQS, [SQSConfiguration]>(() => ({
	addPermission: jest.fn(),
	apiVersions: ['test'],
	changeMessageVisibility: mockedPromiseResolve(undefined),
	changeMessageVisibilityBatch: jest.fn(),
	createQueue: jest.fn(),
	config: {
		accessKeyId: 'test',
		apiVersion: 'test',
		computeChecksums: undefined,
		convertResponseTypes: undefined,
		correctClockSkew: undefined,
		credentialProvider: undefined,
		credentials: {
			accessKeyId: 'test',
			secretAccessKey: 'test',
		},
		customUserAgent: 'test',
		endpoint: 'test',
		maxRetries: 3,
		getCredentials: jest.fn(),
		loadFromPath: jest.fn(),
		getPromisesDependency: jest.fn(),
		update: jest.fn(),
		setPromisesDependency: jest.fn(),
	},
	defineService: jest.fn(),
	deleteMessage: mockedPromiseResolve(undefined),
	deleteMessageBatch: mockedPromiseResolve(undefined),
	deleteQueue: jest.fn(),
	getQueueAttributes: jest.fn(),
	endpoint: {
		host: 'test',
		hostname: 'test',
		href: 'test',
		port: 1000,
		protocol: 'test',
	},
	getQueueUrl: jest.fn(),
	listDeadLetterSourceQueues: jest.fn(),
	listQueueTags: jest.fn(),
	listQueues: jest.fn(),
	makeRequest: jest.fn(),
	makeUnauthenticatedRequest: jest.fn(),
	purgeQueue: jest.fn(),
	receiveMessage: mockedPromiseResolve(mockedReceiveMessageResponse),
	removePermission: jest.fn(),
	sendMessage: jest.fn(),
	sendMessageBatch: mockedPromiseResolve(mockedPublishMessageResponse),
	setQueueAttributes: jest.fn(),
	setupRequestListeners: jest.fn(),
	tagQueue: jest.fn(),
	untagQueue: jest.fn(),
	waitFor: jest.fn(),
}));

export const mockedHandleMessage = jest.fn(() => Promise.resolve());
