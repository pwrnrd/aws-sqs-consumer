import { SQS } from 'aws-sdk';
import { SQSAWSRegions } from './aws-regions';

interface ISQSConfigurationOptions {
	region: SQSAWSRegions;
	accessKeyID: string;
	secretAccessKey: string;
}

export class SQSConfiguration {
	private _secretAccessKey: string;

	private _accessKeyID: string;

	private _region: string;

	private APIVersion = '2012-11-05';

	constructor({ region, accessKeyID, secretAccessKey }: ISQSConfigurationOptions) {
		if (!region || !accessKeyID || !secretAccessKey)
			throw new Error('Provide a region, accessKeyID and secretAccessKey to create an SQSConfiguration');

		this._region = region;
		this._accessKeyID = accessKeyID;
		this._secretAccessKey = secretAccessKey;
	}

	public getConnectionObject(): SQS.Types.ClientConfiguration {
		return {
			region: this._region,
			accessKeyId: this._accessKeyID,
			secretAccessKey: this._secretAccessKey,
			apiVersion: this.APIVersion,
		};
	}
}
