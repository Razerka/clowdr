import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as iam from "@aws-cdk/aws-iam";
import * as logs from "@aws-cdk/aws-logs";
import * as ml from "@aws-cdk/aws-medialive";
import * as s3 from "@aws-cdk/aws-s3";
import { HttpMethods } from "@aws-cdk/aws-s3";
import * as sns from "@aws-cdk/aws-sns";
import * as cdk from "@aws-cdk/core";

export interface AwsStackProps extends cdk.StackProps {
    stackPrefix: string;
}

export class AwsStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: AwsStackProps) {
        super(scope, id, props);

        /** S3 **/
        const bucket = this.createContentS3Bucket();

        /** Shared policies **/
        const cloudFormationIntrospectionPolicy = this.createCloudFormationIntrospectionPolicy();
        const transcribeFullAccessPolicy = this.createTranscribeFullAccessPolicy();

        /** Shared roles **/
        const mediaLiveServiceRole = this.createMediaLiveServiceRole(bucket);
        const mediaPackageServiceRole = this.createMediaPackageServiceRole(bucket);
        const mediaConvertServiceRole = this.createMediaConvertServiceRole(bucket);
        const transcribeServiceRole = this.createTranscribeServiceRole(bucket);
        const elasticTranscoderServiceRole = this.createElasticTranscoderServiceRole(bucket);

        /** SNS topics **/
        const cloudFormationNotificationTopic = this.createCloudFormationNotificationTopic();
        const mediaConvertNotificationTopic = this.createMediaConvertNotificationTopic();
        const mediaLiveNotificationTopic = this.createMediaLiveNotificationTopic();
        const mediaPackageHarvestNotificationTopic = this.createMediaPackageHarvestNotificationTopic();
        const transcribeNotificationTopic = this.createTranscribeNotificationTopic();
        const elasticTranscoderNotificationTopic =
            this.createElasticTranscoderNotificationTopic(elasticTranscoderServiceRole);

        this.addMediaConvertEventRule(mediaConvertNotificationTopic, props.stackPrefix);
        this.addMediaLiveEventRule(mediaLiveNotificationTopic);
        this.addMediaPackageEventRule(mediaPackageHarvestNotificationTopic);
        this.addTranscribeEventRule(transcribeNotificationTopic);

        /** Actions service **/
        const actionsUser = new iam.User(this, "ActionsUser", {});
        const actionsUserAccessKey = new iam.CfnAccessKey(this, "ActionsUserAccessKey", {
            userName: actionsUser.userName,
        });

        actionsUser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSElementalMediaLiveFullAccess"));
        actionsUser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSElementalMediaConvertFullAccess"));
        actionsUser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSElementalMediaPackageFullAccess"));
        actionsUser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonElasticTranscoder_FullAccess"));

        mediaConvertServiceRole.grantPassRole(actionsUser);
        mediaPackageServiceRole.grantPassRole(actionsUser);
        transcribeServiceRole.grantPassRole(actionsUser);
        elasticTranscoderServiceRole.grantPassRole(actionsUser);

        actionsUser.addManagedPolicy(cloudFormationIntrospectionPolicy);
        actionsUser.addManagedPolicy(transcribeFullAccessPolicy);

        const chimeManagerRole = this.createChimeManagerRole(actionsUser);

        this.createSubscriptionPolicy(actionsUser.node.id, actionsUser, [
            mediaConvertNotificationTopic,
            mediaPackageHarvestNotificationTopic,
            transcribeNotificationTopic,
        ]);

        /** PLAYOUT SERVICE **/
        const playoutUser = new iam.User(this, "PlayoutUser", {});
        const playoutUserAccessKey = new iam.CfnAccessKey(this, "PlayoutUserAccessKey", {
            userName: playoutUser.userName,
        });

        playoutUser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSElementalMediaLiveFullAccess"));
        playoutUser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSElementalMediaPackageFullAccess"));
        playoutUser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("CloudFrontFullAccess"));

        mediaLiveServiceRole.grantPassRole(playoutUser);

        const deployChannelStackPolicy = this.createDeployChannelStackPolicy(
            props.env?.region ?? this.region,
            props.env?.account ?? this.account
        );
        playoutUser.addManagedPolicy(deployChannelStackPolicy);

        this.createSubscriptionPolicy(playoutUser.node.id, playoutUser, [
            cloudFormationNotificationTopic,
            mediaLiveNotificationTopic,
        ]);

        /* MediaLive security group */
        const inputSecurityGroup = new ml.CfnInputSecurityGroup(this, "InputSecurityGroup", {
            whitelistRules: [{ cidr: "0.0.0.1/0" }],
        });

        /* Outputs */

        // S3
        this.createOutput("AWS_CONTENT_BUCKET_ID", bucket.bucketName);

        // Credentials
        this.createOutput("AWS_ACTIONS_USER_ACCESS_KEY_ID", actionsUserAccessKey.ref);
        this.createOutput("AWS_ACTIONS_USERS_SECRET_ACCESS_KEY", actionsUserAccessKey.attrSecretAccessKey);
        this.createOutput("AWS_PLAYOUT_USER_ACCESS_KEY_ID", playoutUserAccessKey.ref);
        this.createOutput("AWS_PLAYOUT_USERS_SECRET_ACCESS_KEY", actionsUserAccessKey.attrSecretAccessKey);

        // Service roles
        this.createOutput("AWS_CHIME_MANAGER_ROLE_ARN", chimeManagerRole.roleArn);
        this.createOutput("AWS_MEDIACONVERT_SERVICE_ROLE_ARN", mediaConvertServiceRole.roleArn);
        this.createOutput("AWS_MEDIALIVE_SERVICE_ROLE_ARN", mediaLiveServiceRole.roleArn);
        this.createOutput("AWS_MEDIAPACKAGE_SERVICE_ROLE_ARN", mediaPackageServiceRole.roleArn);
        this.createOutput("AWS_TRANSCRIBE_SERVICE_ROLE_ARN", transcribeServiceRole.roleArn);
        this.createOutput("AWS_ELASTIC_TRANSCODER_SERVICE_ROLE_ARN", elasticTranscoderServiceRole.roleArn);

        // SNS topics
        this.createOutput("AWS_CLOUDFORMATION_NOTIFICATIONS_TOPIC_ARN", cloudFormationNotificationTopic.topicArn);
        this.createOutput("AWS_TRANSCODE_NOTIFICATIONS_TOPIC_ARN", cloudFormationNotificationTopic.topicArn);
        this.createOutput("AWS_TRANSCRIBE_NOTIFICATIONS_TOPIC_ARN", transcribeNotificationTopic.topicArn);
        this.createOutput(
            "AWS_ELASTIC_TRANSCODER_NOTIFICATIONS_TOPIC_ARN",
            elasticTranscoderNotificationTopic.topicArn
        );
        this.createOutput("AWS_MEDIALIVE_NOTIFICATIONS_TOPIC_ARN", mediaLiveNotificationTopic.topicArn);
        this.createOutput(
            "AWS_MEDIAPACKAGE_HARVEST_NOTIFICATIONS_TOPIC_ARN",
            mediaPackageHarvestNotificationTopic.topicArn
        );

        // MediaLive
        this.createOutput("AWS_MEDIALIVE_INPUT_SECURITY_GROUP_ID", inputSecurityGroup.ref);

        // This stack
        this.createOutput("AWS_CLOUDFORMATION_STACK_ARN", this.stackId);
    }

    /**
     * @returns a service role for AWS MediaLive
     */
    private createMediaLiveServiceRole(sourceBucket: s3.Bucket): iam.Role {
        const mediaLiveAccessRole = new iam.Role(this, "MediaLiveRole", {
            assumedBy: new iam.ServicePrincipal("medialive.amazonaws.com"),
        });

        sourceBucket.grantReadWrite(mediaLiveAccessRole);

        mediaLiveAccessRole.addToPolicy(
            new iam.PolicyStatement({
                actions: [
                    "mediastore:ListContainers",
                    "mediastore:PutObject",
                    "mediastore:GetObject",
                    "mediastore:DeleteObject",
                    "mediastore:DescribeObject",
                ],
                resources: ["*"],
                effect: iam.Effect.ALLOW,
            })
        );
        mediaLiveAccessRole.addToPolicy(
            new iam.PolicyStatement({
                actions: [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    "logs:DescribeLogStreams",
                    "logs:DescribeLogGroups",
                ],
                resources: ["arn:aws:logs:*:*:*"],
                effect: iam.Effect.ALLOW,
            })
        );
        mediaLiveAccessRole.addToPolicy(
            new iam.PolicyStatement({
                actions: [
                    "mediaconnect:ManagedDescribeFlow",
                    "mediaconnect:ManagedAddOutput",
                    "mediaconnect:ManagedRemoveOutput",
                ],
                resources: ["*"],
                effect: iam.Effect.ALLOW,
            })
        );
        mediaLiveAccessRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ["mediapackage:DescribeChannel"],
                resources: ["*"],
                effect: iam.Effect.ALLOW,
            })
        );
        mediaLiveAccessRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess"));

        return mediaLiveAccessRole;
    }

    /**
     * @returns a service role for AWS MediaPackage
     */
    private createMediaPackageServiceRole(outputBucket: s3.Bucket): iam.Role {
        const mediaPackageAccessRole = new iam.Role(this, "MediaPackageRole", {
            assumedBy: new iam.ServicePrincipal("mediapackage.amazonaws.com"),
        });
        mediaPackageAccessRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ["s3:PutObject", "s3:ListBucket", "s3:GetBucketLocation"],
                effect: iam.Effect.ALLOW,
                resources: [outputBucket.bucketArn, `${outputBucket.bucketArn}/*`],
            })
        );

        return mediaPackageAccessRole;
    }

    /**
     * @returns a service role for AWS MediaConvert
     */
    private createMediaConvertServiceRole(bucket: s3.Bucket): iam.Role {
        const mediaConvertAccessRole = new iam.Role(this, "MediaConvertRole", {
            assumedBy: new iam.ServicePrincipal("mediaconvert.amazonaws.com"),
        });
        bucket.grantReadWrite(mediaConvertAccessRole);
        mediaConvertAccessRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ["apigateway:*"],
                resources: ["*"],
                effect: iam.Effect.ALLOW,
            })
        );

        return mediaConvertAccessRole;
    }

    /**
     * @returns a service role for Amazon Transcribe
     */
    private createTranscribeServiceRole(bucket: s3.Bucket): iam.Role {
        const transcribeAccessRole = new iam.Role(this, "TranscribeRole", {
            assumedBy: new iam.ServicePrincipal("transcribe.amazonaws.com"),
        });
        bucket.grantReadWrite(transcribeAccessRole);

        return transcribeAccessRole;
    }

    /**
     * @returns a service role for Elastic Transcode.
     */
    private createElasticTranscoderServiceRole(bucket: s3.Bucket): iam.Role {
        const elasticTranscoderServiceRole = new iam.Role(this, "ElasticTranscoderServiceRole", {
            assumedBy: new iam.ServicePrincipal("elastictranscoder.amazonaws.com"),
        });
        elasticTranscoderServiceRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ["s3:Put*", "s3:ListBucket", "s3:*MultipartUpload*", "s3:Get*"],
                effect: iam.Effect.ALLOW,
                resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
            })
        );
        elasticTranscoderServiceRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ["s3:*Delete*", "s3:*Policy*", "sns:*Remove*", "sns:*Delete*", "sns:*Permission*"],
                effect: iam.Effect.DENY,
                resources: ["*"],
            })
        );

        return elasticTranscoderServiceRole;
    }

    /**
     * @returns a policy that grants full access to Amazon Transcribe.
     */
    private createTranscribeFullAccessPolicy(): iam.IManagedPolicy {
        return new iam.ManagedPolicy(this, "TranscribeFullAccessPolicy", {
            description: "Full access to all Amazon Transcribe resources.",
            statements: [
                new iam.PolicyStatement({
                    actions: ["transcribe:*"],
                    effect: iam.Effect.ALLOW,
                    resources: ["*"],
                }),
            ],
        });
    }

    /**
     * @returns a policy that grants access to view the stack created by this class.
     * @remarks The stack outputs can be used to perform automated service discovery, rather than manually copying every identifier into .env files.
     */
    private createCloudFormationIntrospectionPolicy(): iam.IManagedPolicy {
        return new iam.ManagedPolicy(this, "CloudFormationIntrospectionPolicy", {
            description: "Allows introspection of the AwsStack, giving access to the output values.",
            statements: [
                new iam.PolicyStatement({
                    actions: ["cloudformation:DescribeStacks"],
                    effect: iam.Effect.ALLOW,
                    resources: [this.stackId],
                }),
            ],
        });
    }

    /**
     * @returns a policy that allows creation/removal of channel stacks in CloudFormation.
     */
    private createDeployChannelStackPolicy(region: string, accountId: string): iam.IManagedPolicy {
        return new iam.ManagedPolicy(this, "CloudFormation_DeployChannelStackPolicy", {
            description: "Allow creation, introspection and deletion of channel stacks in CloudFormation.",
            statements: [
                new iam.PolicyStatement({
                    actions: [
                        "cloudformation:CreateChangeSet",
                        "cloudformation:CreateStack",
                        "cloudformation:DeleteStack",
                        "cloudformation:DeleteChangeSet",
                        "cloudformation:DescribeChangeSet",
                        "cloudformation:DescribeStacks",
                        "cloudformation:DescribeStackEvents",
                        "cloudformation:DescribeStackResources",
                        "cloudformation:ExecuteChangeSet",
                        "cloudformation:GetTemplate",
                        "cloudformation:ValidateTemplate",
                    ],
                    effect: iam.Effect.ALLOW,
                    resources: [
                        `arn:aws:cloudformation:${region}:${accountId}:stack/room-*/*`,
                        `arn:aws:cloudformation:${region}:${accountId}:stack/CDKToolkit/*`,
                    ],
                }),
                new iam.PolicyStatement({
                    actions: ["s3:*Object", "s3:ListBucket", "s3:GetBucketLocation"],
                    effect: iam.Effect.ALLOW,
                    resources: ["arn:aws:s3:::cdktoolkit-stagingbucket-*"],
                }),
            ],
        });
    }

    /**
     * @param assumedBy the principal that can assume the created role.
     * @returns a role that has full access to Chime resources.
     */
    private createChimeManagerRole(assumedBy: iam.IPrincipal): iam.IRole {
        const chimeFullAccessPolicy = new iam.Policy(this, "ChimeFullAccess");
        chimeFullAccessPolicy.addStatements(
            new iam.PolicyStatement({
                actions: [
                    "chime:CreateMeeting",
                    "chime:DeleteMeeting",
                    "chime:GetMeeting",
                    "chime:ListMeetings",
                    "chime:CreateAttendee",
                    "chime:BatchCreateAttendee",
                    "chime:DeleteAttendee",
                    "chime:GetAttendee",
                    "chime:ListAttendees",
                    "chime:ListAttendeeTags",
                    "chime:ListMeetingTags",
                    "chime:ListTagsForResource",
                    "chime:TagAttendee",
                    "chime:TagMeeting",
                    "chime:TagResource",
                    "chime:UntagAttendee",
                    "chime:UntagMeeting",
                    "chime:UntagResource",
                ],
                effect: iam.Effect.ALLOW,
                resources: ["*"],
            })
        );
        const chimeManagerRole = new iam.Role(this, "ChimeManager", { assumedBy });
        chimeFullAccessPolicy.attachToRole(chimeManagerRole);

        return chimeManagerRole;
    }

    /**
     * @returns a publicly-accessible S3 bucket for content storage.
     */
    private createContentS3Bucket(): s3.Bucket {
        const bucket = new s3.Bucket(this, "ContentBucket", {
            blockPublicAccess: {
                blockPublicAcls: true,
                blockPublicPolicy: false,
                ignorePublicAcls: true,
                restrictPublicBuckets: false,
            },
        });

        bucket.addCorsRule({
            allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.POST],
            allowedOrigins: ["*"],
            exposedHeaders: ["ETag"],
            maxAge: 3000,
            allowedHeaders: ["Authorization", "x-amz-date", "x-amz-content-sha256", "content-type"],
        });
        bucket.addCorsRule({
            allowedHeaders: [],
            allowedMethods: [HttpMethods.GET],
            allowedOrigins: ["*"],
            exposedHeaders: [],
            maxAge: 3000,
        });

        return bucket;
    }

    /**
     * @returns an SNS topic that can receive notifications from CloudFormation.
     */
    private createCloudFormationNotificationTopic(): sns.Topic {
        const topic = new sns.Topic(this, "CloudFormationNotifications");
        topic.grantPublish({
            grantPrincipal: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
        });
        return topic;
    }

    /**
     * @returns an SNS topic for MediaConvert notifications.
     */
    private createMediaConvertNotificationTopic(): sns.Topic {
        return new sns.Topic(this, "TranscodeNotifications");
    }

    /**
     * @returns an SNS topic for MediaLive notifications.
     */
    private createMediaLiveNotificationTopic(): sns.Topic {
        return new sns.Topic(this, "MediaLiveNotifications");
    }

    /**
     * @returns an SNS topic for MediaPackage notifications.
     */
    private createMediaPackageHarvestNotificationTopic(): sns.Topic {
        return new sns.Topic(this, "MediaPackageHarvestNotifications");
    }

    /**
     * @returns an SNS topic for Amazon Transcribe notifications.
     */
    private createTranscribeNotificationTopic(): sns.Topic {
        return new sns.Topic(this, "TranscribeNotifications");
    }

    /**
     * @param elasticTranscoderServiceRole a role to be granted permission to publish to the created topic.
     * @returns an SNS topic for Elastic Transcoder pipeline notifications.
     */
    private createElasticTranscoderNotificationTopic(elasticTranscoderServiceRole: iam.IPrincipal): sns.Topic {
        const topic = new sns.Topic(this, "ElasticTranscoderNotifications");
        topic.grantPublish(elasticTranscoderServiceRole);
        return topic;
    }

    /**
     * @summary Create and attach a policy allowing the identity to subscribe to the listed topics.
     * @param id A scope-unique id for this policy.
     */
    private createSubscriptionPolicy(id: string, identity: iam.IIdentity, topics: sns.Topic[]): void {
        const policy = new iam.ManagedPolicy(this, `SNSAllowSubscription${id}Policy`, {
            statements: [
                new iam.PolicyStatement({
                    actions: ["SNS:Subscribe"],
                    effect: iam.Effect.ALLOW,
                    principals: [identity],
                    resources: topics.map((topic) => topic.topicArn),
                }),
            ],
        });
        identity.addManagedPolicy(policy);
    }

    /**
     * Create a rule that listens to MediaConvert nofications and publishes them to the topic.
     */
    private addMediaConvertEventRule(mediaConvertNotificationTopic: sns.ITopic, stackPrefix: string): void {
        mediaConvertNotificationTopic.grantPublish({
            grantPrincipal: new iam.ServicePrincipal("events.amazonaws.com"),
        });
        events.EventBus.grantAllPutEvents(new iam.ServicePrincipal("mediaconvert.amazonaws.com"));
        const rule = new events.Rule(this, "TranscodeEventRule", {
            enabled: true,
        });
        rule.addEventPattern({
            source: ["aws.mediaconvert"],
            detailType: ["MediaConvert Job State Change"],
            detail: {
                userMetadata: {
                    environment: [stackPrefix],
                },
            },
        });
        rule.addTarget(new targets.SnsTopic(mediaConvertNotificationTopic));
        const logGroup = new logs.LogGroup(this, "TranscodeLogGroup", {});
        rule.addTarget(new targets.CloudWatchLogGroup(logGroup));
    }

    /**
     * Create a rule that listens to MediaLive nofications and publishes them to the topic.
     */
    private addMediaLiveEventRule(mediaLiveNotificationTopic: sns.ITopic): void {
        mediaLiveNotificationTopic.grantPublish({
            grantPrincipal: new iam.ServicePrincipal("events.amazonaws.com"),
        });

        events.EventBus.grantAllPutEvents(new iam.ServicePrincipal("medialive.amazonaws.com"));
        const rule = new events.Rule(this, "MediaLiveEventRule", {
            enabled: true,
        });
        rule.addEventPattern({
            source: ["aws.medialive"],
        });
        rule.addTarget(new targets.SnsTopic(mediaLiveNotificationTopic));
        const logGroup = new logs.LogGroup(this, "MediaLiveLogGroup", {});
        rule.addTarget(new targets.CloudWatchLogGroup(logGroup));
    }

    /**
     * Create a rule that listens to MediaPackage nofications and publishes them to the topic.
     */
    private addMediaPackageEventRule(mediaPackageHarvestNotificationTopic: sns.ITopic): void {
        mediaPackageHarvestNotificationTopic.grantPublish({
            grantPrincipal: new iam.ServicePrincipal("events.amazonaws.com"),
        });
        events.EventBus.grantAllPutEvents(new iam.ServicePrincipal("mediapackage.amazonaws.com"));
        const rule = new events.Rule(this, "MediaPackageHarvestEventRule", {
            enabled: true,
        });
        rule.addEventPattern({
            source: ["aws.mediapackage"],
            detailType: ["MediaPackage HarvestJob Notification"],
        });
        rule.addTarget(new targets.SnsTopic(mediaPackageHarvestNotificationTopic));
    }

    /**
     * Create a rule that listens to Amazon Transcribe nofications and publishes them to the topic.
     */
    private addTranscribeEventRule(transcribeNotificationTopic: sns.ITopic): void {
        transcribeNotificationTopic.grantPublish({
            grantPrincipal: new iam.ServicePrincipal("events.amazonaws.com"),
        });
        events.EventBus.grantAllPutEvents(new iam.ServicePrincipal("transcribe.amazonaws.com"));
        const rule = new events.Rule(this, "TranscribeEventRule", {
            enabled: true,
        });
        rule.addEventPattern({
            source: ["aws.transcribe"],
            detailType: ["Transcribe Job State Change"],
        });
        rule.addTarget(new targets.SnsTopic(transcribeNotificationTopic));
        const transcribeLogGroup = new logs.LogGroup(this, "TranscribeLogGroup", {});
        rule.addTarget(new targets.CloudWatchLogGroup(transcribeLogGroup));
    }

    /**
     * Create an output from the CloudFormation stack.
     * @param id the scope-unique name of the output
     * @param value the value of the output
     */
    private createOutput(id: string, value: string): void {
        new cdk.CfnOutput(this, id, {
            value,
        });
    }
}
