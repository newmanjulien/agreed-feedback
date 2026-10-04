// Validate JSONL with the same Convex validator descriptions used for persistence.
export function assertShape(value, schema, path = 'record') {
	switch (schema.type) {
		case 'union':
			for (const member of schema.value) {
				try {
					assertShape(value, member, path);
					return;
				} catch {
					/* try the next variant */
				}
			}
			throw new Error(`${path} does not match any persisted variant`);
		case 'object': {
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new Error(`${path} must be an object`);
			for (const key of Object.keys(value))
				if (!(key in schema.value)) throw new Error(`${path}.${key} is not a persisted field`);
			for (const [key, field] of Object.entries(schema.value)) {
				if (!(key in value) && field.optional) continue;
				assertShape(value[key], field.fieldType, `${path}.${key}`);
			}
			return;
		}
		case 'array':
			if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
			value.forEach((item, i) => assertShape(item, schema.value, `${path}[${i}]`));
			return;
		case 'literal':
			if (value !== schema.value) throw new Error(`${path} must equal ${schema.value}`);
			return;
		case 'string':
		case 'boolean':
		case 'number':
			if (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite(value)))
				throw new Error(`${path} must be ${schema.type}`);
			return;
		default:
			throw new Error(`Unsupported seed validator ${schema.type}`);
	}
}
