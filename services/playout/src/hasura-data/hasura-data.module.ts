import { DynamicModule, FactoryProvider, Global, Module, ModuleMetadata } from "@nestjs/common";
import { HASURA_MODULE_OPTIONS } from "../constants";
import { ChannelStackCreateJobService } from "./channel-stack-create-job/channel-stack-create-job.service";
import { ChannelStackDeleteJobService } from "./channel-stack-delete-job/channel-stack-delete-job.service";
import { ChannelStackDataService } from "./channel-stack/channel-stack.service";
import { ConferenceConfigurationService } from "./conference-configuration/conference-configuration.service";
import { GraphQlService } from "./graphql/graphql.service";
import { LocalScheduleService } from "./local-schedule/local-schedule.service";

export type HasuraDataModuleOptions = {
    useSecureProtocols: boolean;
    graphQlApiDomain: string;
    hasuraAdminSecret: string;
};

@Global()
@Module({
    providers: [
        GraphQlService,
        ChannelStackDataService,
        ChannelStackCreateJobService,
        ChannelStackDeleteJobService,
        LocalScheduleService,
        ConferenceConfigurationService,
    ],
    exports: [
        GraphQlService,
        ChannelStackDataService,
        ChannelStackCreateJobService,
        ChannelStackDeleteJobService,
        LocalScheduleService,
        ConferenceConfigurationService,
    ],
})
export class HasuraDataModule {
    static forRootAsync(
        config: Omit<FactoryProvider<HasuraDataModuleOptions | Promise<HasuraDataModuleOptions>>, "provide"> &
            Pick<ModuleMetadata, "imports">
    ): DynamicModule {
        return {
            module: HasuraDataModule,
            imports: config.imports ?? [],
            providers: [
                {
                    provide: HASURA_MODULE_OPTIONS,
                    useFactory: config.useFactory,
                    inject: config.inject,
                },
                GraphQlService,
            ],
            exports: [GraphQlService],
        };
    }
}