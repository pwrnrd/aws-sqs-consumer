export interface CustomAWSError extends Error {
	code: string;
	statusCode: number;
	region: string;
	hostname: string;
	time: Date;
	retryable: boolean;
}

export class SQSError extends Error {
	private _name: string;

	private _originalMessage: string;

	private _originalStack: string | undefined;

	private _code: string;

	private _statusCode: number;

	private _region: string;

	private _hostname: string;

	private _time: Date;

	private _retryable: boolean;

	constructor(
		{
			message: originalMessage,
			stack: originalStack,
			code,
			statusCode,
			region,
			retryable,
			hostname,
			time,
		}: CustomAWSError,
		message: string,
	) {
		super(message);
		this._name = this.constructor.name;
		this._originalMessage = originalMessage;
		this._originalStack = originalStack;
		this._code = code;
		this._statusCode = statusCode;
		this._region = region;
		this._retryable = retryable;
		this._hostname = hostname;
		this._time = time;
	}

	public get name(): string {
		return this._name;
	}

	public get message(): string {
		return this.message;
	}

	public get originalMessage(): string {
		return this._originalMessage;
	}

	public get originalStack(): string | undefined {
		return this._originalStack;
	}

	public get code(): string {
		return this._code;
	}

	public get statusCode(): number {
		return this._statusCode;
	}

	public get region(): string {
		return this._region;
	}

	public get hostname(): string {
		return this._hostname;
	}

	public get time(): Date {
		return this._time;
	}

	public get retryable(): boolean {
		return this._retryable;
	}
}
