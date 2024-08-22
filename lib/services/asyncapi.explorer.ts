import { Type } from '@nestjs/common';
import { MetadataScanner } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { flatten } from 'lodash';
import {
  asyncApiClassAnnotationLabels,
  exploreAsyncapiClassMetadata,
  exploreAsyncApiOperationMetadata,
  exploreControllerMetadata,
  exploreGatewayMetadata,
  exploreServerMetadata,
} from '../explorers';
import {
  AsyncServerObject,
  DenormalizedDoc,
  DenormalizedDocResolvers,
} from '../interface';

export class AsyncApiExplorer {
  private readonly metadataScanner = new MetadataScanner();
  private readonly schemas: SchemaObject[] = [];
  private readonly schemaRefsStack: string[] = [];
  private readonly servers: Record<string, AsyncServerObject> = {};

  private operationIdFactory = (controllerKey: string, methodKey: string) =>
    controllerKey ? `${controllerKey}_${methodKey}` : methodKey;

  public explorerAsyncapiServices(
    wrapper: InstanceWrapper,
    modulePath?: string,
    globalPrefix?: string,
    operationIdFactory?: (controllerKey: string, methodKey: string) => string,
  ) {
    if (operationIdFactory) {
      this.operationIdFactory = operationIdFactory;
    }

    const { instance, metatype } = wrapper;
    if (
      !instance ||
      !metatype ||
      !Reflect.getMetadataKeys(metatype).find((label) =>
        asyncApiClassAnnotationLabels.includes(label),
      )
    ) {
      return [];
    }

    const prototype = Object.getPrototypeOf(instance);
    const documentResolvers: DenormalizedDocResolvers = {
      root: [
        exploreAsyncapiClassMetadata,
        exploreControllerMetadata,
        exploreGatewayMetadata,
      ],
      security: [],
      tags: [],
      operations: [exploreAsyncApiOperationMetadata],
    };

    return this.generateDenormalizedDocument(
      metatype as Type<unknown>,
      prototype,
      instance,
      documentResolvers,
      modulePath,
      globalPrefix,
    );
  }

  public getSchemas(): Record<string, SchemaObject> {
    const ret = { ...this.schemas } as unknown as Record<string, SchemaObject>;
    return ret;
  }

  public getServers(): Record<string, AsyncServerObject> {
    const ret = { ...this.servers } as unknown as Record<
      string,
      AsyncServerObject
    >;
    return ret;
  }

  private generateDenormalizedDocument(
    metatype: Type<unknown>,
    prototype: Type<unknown>,
    instance: object,
    documentResolvers: DenormalizedDocResolvers,
    _modulePath?: string,
    _globalPrefix?: string,
  ): DenormalizedDoc[] {
    const denormalizedAsyncapiServices = this.metadataScanner.scanFromPrototype<
      unknown,
      DenormalizedDoc[]
    >(instance, prototype, (name) => {
      const serverMetadata = exploreServerMetadata(metatype);
      const servers = serverMetadata?.map(({ url }) => url);
      if (serverMetadata) {
        for (const server of serverMetadata) {
          const { name, ...serverObject } = server;
          this.servers[name] = serverObject;
        }
      }

      const targetCallback = prototype[name];
      const methodMetadata = documentResolvers.root.reduce((_metadata, fn) => {
        const serviceMetadata = fn(metatype);

        const channels = documentResolvers.operations.reduce(
          (operations, exploreOperationsMeta) => {
            const meta = exploreOperationsMeta(
              this.schemas,
              instance,
              prototype,
              targetCallback,
            );
            if (!meta) {
              return operations;
            }

            meta.forEach((op) => {
              if (operations.hasOwnProperty(op.channel)) {
                operations[op.channel] = { ...operations[op.channel], ...op };
              } else {
                operations[op.channel] = op;
              }
            });
            return operations;
          },
          {},
        );

        return Object.keys(channels).map((channel) => ({
          root: { ...serviceMetadata, servers, name: channel },
          operations: channels[channel],
        }));
      }, []);
      return methodMetadata;
    });

    return flatten(denormalizedAsyncapiServices);
  }
}
