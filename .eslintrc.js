module.exports = {
	"parser": "@typescript-eslint/parser",
	"parserOptions": {
		project: './tsconfig.eslint.json',
	},
	"extends": [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",  // Uses the recommended rules from the @typescript-eslint/eslint-plugin
		"plugin:jest/recommended",
		"plugin:import/errors",
		"plugin:import/typescript",
		"plugin:prettier/recommended",
		"prettier/@typescript-eslint", // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
	],
	"env": {
		"node": true,
		"es2020": true,
	},
	"overrides": [
		{
			"files": [
				"**/*.test.js",
				"**/*.test.ts"
			],
			"env": {
				"jest": true
			},
			"rules": {
				"jest/no-disabled-tests": "warn",
				"jest/no-focused-tests": "error",
				"jest/no-identical-title": "error",
				"jest/prefer-to-have-length": "warn",
				"jest/valid-expect": "error",
				"jest/no-test-callback": "off",
				"@typescript-eslint/explicit-function-return-type": ["off"]
			}
		}
	],
	"rules": {
		"prettier/prettier": "error",
		"quotes": ["error",	"single", {	"allowTemplateLiterals": true }],

		// ==== import plugin rules ====
		"import/named": 1, //Ensure named imports correspond to a named export in the remote file. 
		"import/default": 1, //Ensure a default export is present, given a default import.
		"import/no-unresolved": 1, //Ensure imports point to a file/module that can be resolved.
		"import/no-self-import": 1, // Forbid a module from importing itself.
		"import/no-cycle": "off", //Forbid a module from importing a module with a dependency path back to itself. (
		"import/no-unused-modules": 1, //Forbid modules without any export, and exports not imported by any modules. 
		/* Forbid default exports. <- We forbid this to make sure that everyone who
			imports a module uses the modules name, which is part of the ubiquitous language. 
			Hence, the same thing, in the same domain, should not be able to be named different in different files.
		*/
		"import/no-default-export": 1,

		// ==== typescript rules ====
		'@typescript-eslint/no-useless-constructor': 'error',
		"@typescript-eslint/no-use-before-define": [
			"error",
			{
				"functions": false,
				"classes": false,
			}
		],
		"@typescript-eslint/explicit-member-accessibility": [
			"error",
			{
				"accessibility": "explicit",
				"overrides": {
					"constructors": 'no-public' // allow constructors not to have an accessibility modifier when they are public.
				}
			}
		],
		"@typescript-eslint/interface-name-prefix": 0,	// Interfaces should be prefixed with 'I'
	},
}