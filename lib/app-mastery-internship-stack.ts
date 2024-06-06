import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { Construct } from "constructs";

// Haven't added any comments but can add if needed
export class AppMasteryInternshipStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubToken = cdk.SecretValue.secretsManager("GitHubToken");

    const iamRole = new iam.Role(this, "AppMasteryInternshipRole", {
      assumedBy: new iam.AnyPrincipal(),
    });

    iamRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecs:*",
          "ecr:*",
          "elasticloadbalancing:*",
          "ec2:*",
          "s3:*",
          "codedeploy:*",
          "codebuild:*",
          "codepipeline:*",
          "cloudwatch:*",
          "logs:*",
        ],
        resources: ["*"],
      })
    );

    const vpc = new ec2.Vpc(this, "InternshipVPC", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "app-mastery-public-subnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "app-mastery-private-subnet",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    const ecrRepositoryNginx = ecr.Repository.fromRepositoryName(
      this,
      "EcrRepositoryNginx",
      "app-mastery-internship"
    );

    const cluster = new ecs.Cluster(this, "InternshipCluster", {
      vpc: vpc,
    });

    const taskDefinitionECSSample = new ecs.FargateTaskDefinition(
      this,
      "InternshipClusterTaskDefECSSample",
      {
        taskRole: iamRole,
        executionRole: iamRole,
        cpu: 256,
        memoryLimitMiB: 512,
      }
    );

    const taskDefinitionNginx = new ecs.FargateTaskDefinition(
      this,
      "InternshipClusterTaskDefNginx",
      {
        taskRole: iamRole,
        executionRole: iamRole,
        cpu: 256,
        memoryLimitMiB: 512,
      }
    );

    taskDefinitionECSSample.addContainer(
      "InternshipClusterContainerECSSample",
      {
        image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
        portMappings: [
          {
            containerPort: 80,
          },
        ],
      }
    );

    taskDefinitionNginx.addContainer("InternshipClusterContainerNginx", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepositoryNginx, "latest"),
      portMappings: [
        {
          containerPort: 80,
        },
      ],
    });

    new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      "InternshipClusterServiceECSSample",
      {
        cluster: cluster,
        taskDefinition: taskDefinitionECSSample,
        desiredCount: 2,
        publicLoadBalancer: true,
        assignPublicIp: false,
        listenerPort: 80,
      }
    );

    const ApplicationLoadBalancedServiceNginx =
      new ecs_patterns.ApplicationLoadBalancedFargateService(
        this,
        "InternshipClusterServiceNginx",
        {
          cluster: cluster,
          taskDefinition: taskDefinitionNginx,
          desiredCount: 2,
          publicLoadBalancer: true,
          assignPublicIp: false,
          listenerPort: 80,
          deploymentController: {
            type: ecs.DeploymentControllerType.CODE_DEPLOY,
          },
        }
      );

    const blueTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "BlueTargetGroup",
      {
        vpc: cluster.vpc,
        port: 80,
        targetType: elbv2.TargetType.IP,
      }
    );

    const greenTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "GreenTargetGroup",
      {
        vpc: cluster.vpc,
        port: 80,
        targetType: elbv2.TargetType.IP,
      }
    );

    const codedeployDeploymentGroupNginx = new codedeploy.EcsDeploymentGroup(
      this,
      "InternshipClusterDeploymentGroup",
      {
        service: ApplicationLoadBalancedServiceNginx.service,
        deploymentConfig:
          codedeploy.EcsDeploymentConfig.CANARY_10PERCENT_5MINUTES,
        blueGreenDeploymentConfig: {
          blueTargetGroup: blueTargetGroup,
          greenTargetGroup: greenTargetGroup,
          listener: ApplicationLoadBalancedServiceNginx.listener,
        },
      }
    );

    const artifactSource = new codepipeline.Artifact();
    const artifactBuild = new codepipeline.Artifact();

    const project = new codebuild.PipelineProject(
      this,
      "AppMasteryPipelineProject",
      {
        role: iamRole,
        buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yaml"),
        environmentVariables: {
          IMAGE_URI: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: ecrRepositoryNginx.repositoryUri,
          },
        },
      }
    );

    new codepipeline.Pipeline(this, "AppMasteryPipeline", {
      pipelineName: "AppMasteryPipeline",
      role: iamRole,
      stages: [
        {
          stageName: "Source",
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: "GitHub",
              output: artifactSource,
              owner: "Dev-Destructor",
              repo: "app-mastery-internship",
              branch: "master",
              oauthToken: githubToken,
            }),
          ],
        },
        {
          stageName: "Build",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "CodeBuild",
              project: project,
              input: artifactSource,
              outputs: [artifactBuild],
            }),
          ],
        },
        {
          stageName: "Deploy",
          actions: [
            new codepipeline_actions.CodeDeployEcsDeployAction({
              actionName: "CodeDeploy",
              deploymentGroup: codedeployDeploymentGroupNginx,
              appSpecTemplateInput: artifactBuild,
              taskDefinitionTemplateInput: artifactBuild,
            }),
          ],
        },
      ],
    });

    new cdk.CfnOutput(this, "InternshipVPCOutput", {
      value: vpc.vpcId,
      description: "The VPC ID of the Internship VPC",
      exportName: "InternshipVPC",
    });

    new cdk.CfnOutput(
      this,
      "InternshipClusterApplicationLoadBalancerECSSampleDNSName",
      {
        value:
          "InternshipClusterServiceECSSample.loadBalancer.loadBalancerDnsName",
        description: "The DNS name of the ALB for ECS Sample",
        exportName: "InternshipClusterALBECS",
      }
    );

    new cdk.CfnOutput(
      this,
      "InternshipClusterApplicationLoadBalancerNginxDNSName",
      {
        value: "InternshipClusterServiceNginx.loadBalancer.loadBalancerDnsName",
        description: "The DNS name of the ALB",
        exportName: "InternshipClusterALBNginx",
      }
    );
  }
}
