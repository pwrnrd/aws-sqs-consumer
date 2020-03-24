module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
	  "./dist",
	],
  collectCoverage: true,
  coverageDirectory: "./coverage",
  collectCoverageFrom: [
	  "./src/**"
	],
  coveragePathIgnorePatterns: [
	  "./dist",
	],
	testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
};