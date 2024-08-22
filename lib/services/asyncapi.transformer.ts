import {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AsyncChannelObject,
  AsyncChannelsObject,
  DenormalizedDoc,
} from '../interface';

function isReferenceObject(value: unknown): value is ReferenceObject {
  return (
    typeof value === 'object' && (value as ReferenceObject).$ref !== undefined
  );
}

export class AsyncapiTransformer {
  public normalizeChannels(
    denormalizedDocs: DenormalizedDoc[],
  ): Record<'channels', AsyncChannelsObject> {
    const flatChannels = denormalizedDocs.map((doc: DenormalizedDoc) => {
      const key = doc.root.name;
      const value: AsyncChannelObject = {
        description: doc.root.description,
        bindings: doc.root.bindings,
        parameters: doc.root.parameters,
        subscribe: doc.operations.sub,
        publish: doc.operations.pub,
        servers: doc.root.servers,
      };
      return { key, value };
    });

    const channels = flatChannels.reduce((acc, { key, value }) => {
      if (!acc[key]) {
        acc[key] = value;
      }

      acc[key].publish = acc[key].publish ?? value.publish;
      acc[key].subscribe = acc[key].subscribe ?? value.subscribe;

      return acc;
    }, {});

    return { channels };
  }

  public normalizeSchemas(
    denormalizedSchemas: Record<string, SchemaObject>,
  ): Record<string, SchemaObject> {
    const normalizedSchemas = Object.entries(denormalizedSchemas).reduce(
      (acc, [key, value]) => {
        const { properties } = value;

        if (!properties) {
          acc[key] = value;
          return acc;
        }

        acc[key] = {
          ...value,
          properties: Object.entries(properties).reduce(
            (propAcc, [propKey, propValue]) => {
              if (isReferenceObject(propValue)) {
                propAcc[propKey] = propValue;
              } else {
                const { nullable, type, allOf, ...rest } = propValue;
                const [$ref] = allOf ?? [];
                if (nullable) {
                  propAcc[propKey] = {
                    ...rest,
                    oneOf: [{ type: 'null' }, $ref ? $ref : { type }],
                  };
                } else {
                  propAcc[propKey] = propValue;
                }
              }
              return propAcc;
            },
            {},
          ),
        };
        return acc;
      },
      {},
    );

    return normalizedSchemas;
  }
}
