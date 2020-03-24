export function autoBind(obj: { [key: string]: any }): void {
	const propertyNames = Object.getOwnPropertyNames(obj.constructor.prototype);
	propertyNames.forEach((propertyName: string) => {
		const value = obj[propertyName];
		// eslint-disable-next-line no-param-reassign
		if (isMethod(propertyName, value)) obj[propertyName] = value.bind(obj);
	});
}

function isMethod(propertyName: string, value: any): boolean {
	return propertyName !== 'constructor' && typeof value === 'function';
}
