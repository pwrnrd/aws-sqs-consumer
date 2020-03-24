# AWS SQS Consumer

A AWS SQS message consumer written in Typescript based on the great work of the contributors to [bbc/sqs-consumer](https://github.com/bbc/sqs-consumer)

[![Build Status](https://travis-ci.org/pwrnrd/aws-sqs-consumer.svg)](https://travis-ci.org/pwrnrd/aws-sqs-consumer)
[![Code Climate](https://codeclimate.com/github/pwrnrd/aws-sqs-consumer/badges/gpa.svg)](https://codeclimate.com/github/BBC/sqs-consumer)
[![Test Coverage](https://codeclimate.com/github/pwrnrd/aws-sqs-consumer/badges/coverage.svg)](https://codeclimate.com/github/BBC/sqs-consumer)

Build SQS-based applications without the boilerplate. Just define an async function that handles the SQS message processing.

## 1. Installation

```bash
npm install pwrnrd/aws-sqs-consumer
```

## 2. Usage

There are two ways to set-up the SQS Consumer:

-   Simple
-   Extensive

### 2.1 Simple

The easiest way to start listening for messages is by using `SQSSimpleConsumer`. This consumer starts listening for messages automatically and logs the output of important events. SQSSimpleConsumer is an easy way to start, but is highly opinionated.

Simple Message Batch Handler (opinionated):

```js
// create a consumer and listen to messages: the simple way
import { SQSSimpleConsumer, SQSConfig, SQSAWSRegion } from '@pwrnrd/sqs';

const aSQSConfig = new SQSConfiguration({
	region: SQSAWSRegions['eu-west-1'], // <- the AWS Region to Connect To.
	secretAccessKey: 'some-secret-key', // <- your AWS Secret Access Key
	accessKeyID: 'some-access-key-id', // <- your AWS Access Key ID
});

const queueURL = 'https://sqs.eu-west-1.amazonaws.com/000011112222/names'; // <- your queue URL

const handleMessages = (message) => {
	console.log(message);
};

const simpleConsumer = new SQSSimpleConsumer(handleMessages, queue, aSQSConfig);

// No need to start, the simple consumer starts when it is initialized.

// something

simpleConsumer.stop();
```

### 2.2 Extensive

If you want more control over when the consumer should start listening for messages or you want to change the way the SQS consumer responds to events, you should use `SQSConsumer`.

```js
const { SQSConsumer, SQSConfig, SQSAWSRegion } = require('pwr');
import keys from './keys';

const queueURL = 'https://sqs.eu-west-1.amazonaws.com/000011112222/names'; // <- your queue URL

const messageHandler = (messages) => {
	console.log(messages);
};

const aSQSConfig = new SQSConfiguration({
	region: SQSAWSRegions['eu-west-1'], // <- the AWS Region to Connect To.
	secretAccessKey: 'some-secret-key', // <- your AWS Secret Access Key
	accessKeyID: 'some-access-key-id', // <- your AWS Access Key ID
});

const aSQSConsumer = new SQSConsumer(queueURL, aSQSConfig, {
	handleMessageBatch: massageBatchHandler,
	pollingTimeout: 0,
	batchSize: 10,
});

aSQSConsumer.on('error', (err) => {
	console.error(err.message);
});

aSQSConsumer.on('processing_error', (err) => {
	console.error(err.message);
});

aaSQSConsumerpp.on('timeout_error', (err) => {
	console.error(err.message);
});

aSQSConsumer.start();

// something

aSQSConsumer.stop();
```

## 3. How it works

-   The queue is polled continuously for messages using [long polling](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html).
-   Messages are deleted from the queue once the handler function has completed successfully.
-   Throwing an error (or returning a rejected promise) from the handler function will cause the message to be left on the queue. An [SQS redrive policy](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/SQSDeadLetterQueue.html) can be used to move messages that cannot be processed to a dead letter queue.
-   By default messages are processed one at a time – a new message won't be received until the first one has been processed. To process messages in parallel, use the `batchSize` option [detailed below](#options).

## 4. Consumer API

### 4.1 Consumer Options

-   `queueUrl` - _String_ - The SQS queue URL
-   `region` - _String_ - The AWS region (default `eu-west-1`)
-   `handleMessage` - _Function_ - An `async` function (or function that returns a `Promise`) to be called whenever a message is received. Receives an SQS message object as it's first argument.
-   `handleMessageBatch` - _Function_ - An `async` function (or function that returns a `Promise`) to be called whenever a batch of messages is received. Similar to `handleMessage` but will receive the list of messages, not each message individually. **If both are set, `handleMessageBatch` overrides `handleMessage`**.
-   `handleMessageTimeout` - _String_ - Time in ms to wait for `handleMessage` to process a message before timing out. Emits `timeout_error` on timeout. By default, if `handleMessage` times out, the unprocessed message returns to the end of the queue.
-   `attributeNames` - _Array_ - List of queue attributes to retrieve (i.e. `['All', 'ApproximateFirstReceiveTimestamp', 'ApproximateReceiveCount']`).
-   `messageAttributeNames` - _Array_ - List of message attributes to retrieve (i.e. `['name', 'address']`).
-   `batchSize` - _Number_ - The number of messages to request from SQS when polling (default `1`). This cannot be higher than the AWS limit of 10.
-   `visibilityTimeout` - _Number_ - The duration (in seconds) that the received messages are hidden from subsequent retrieve requests after being retrieved by a ReceiveMessage request.
-   `terminateVisibilityTimeout` - _Boolean_ - If true, sets the message visibility timeout to 0 after a `processing_error` (defaults to `false`).
-   `waitTimeSeconds` - _Number_ - The duration (in seconds) for which the call will wait for a message to arrive in the queue before returning.
-   `authenticationErrorTimeout` - _Number_ - The duration (in milliseconds) to wait before retrying after an authentication error (defaults to `10000`).
-   `pollingWaitTimeMs` - _Number_ - The duration (in milliseconds) to wait before repolling the queue (defaults to `0`).
-   `sqs` - _Object_ - An optional [AWS SQS](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html) object to use if you need to configure the client manually

#### 4.1.1 `consumer.start()`

Start polling the queue for messages.

#### 4.1.2 `consumer.stop()`

Stop polling the queue for messages.

#### 4.1.3 `consumer.isRunning`

Returns the current polling state of the consumer: `true` if it is actively polling, `false` if it is not.

### 4.2 Consumer Events

Each consumer is an [`EventEmitter`](http://nodejs.org/api/events.html) and emits the following events:

| Event                | Params             | Description                                                                                                                   |
| -------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `error`              | `err`, `[message]` | Fired when an error occurs interacting with the queue. If the error correlates to a message, that error is included in Params |
| `processing_error`   | `err`, `message`   | Fired when an error occurs processing the message.                                                                            |
| `timeout_error`      | `err`, `message`   | Fired when `handleMessageTimeout` is supplied as an option and if `handleMessage` times out.                                  |
| `message_received`   | `message`          | Fired when a message is received.                                                                                             |
| `message_processed`  | `message`          | Fired when a message is successfully processed and removed from the queue.                                                    |
| `response_processed` | None               | Fired after one batch of items (up to `batchSize`) has been successfully processed.                                           |
| `stopped`            | None               | Fired when the consumer finally stops its work.                                                                               |
| `empty`              | None               | Fired when the queue is empty (All messages have been consumed).                                                              |

## 5. Credentials

By default the consumer will look for AWS credentials in the places [specified by the AWS SDK](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Setting_AWS_Credentials). The simplest option is to export your credentials as environment variables:

```bash
export AWS_SECRET_ACCESS_KEY=...
export AWS_ACCESS_KEY_ID=...
export AWS_REGION=...
```

## 6. AWS IAM Permissions

Consumer will receive and delete messages from the SQS queue. Ensure `sqs:ReceiveMessage` and `sqs:DeleteMessage` access is granted on the queue being consumed.

## 7. Contributing

See contributing [guildlines](https://github.com/pwrnrd/aws-sqs-consumer/blob/master/CONTRIBUTING.md)
