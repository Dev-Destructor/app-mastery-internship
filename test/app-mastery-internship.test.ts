import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as AppMasteryInternship from "../lib/app-mastery-internship-stack";

// example test. To run these tests, uncomment this file along with the
// example resource in lib/app-mastery-internship-stack.ts

test("Testing IAM Role", () => {
  const app = new cdk.App();
  const stack = new AppMasteryInternship.AppMasteryInternshipStack(
    app,
    "InternshipIAMRoleTestStack"
  );

  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::IAM::Role", {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            AWS: "*",
          },
        },
      ],
      Version: "2012-10-17",
    },
  });
});

test("Testing VPC", () => {
  const app = new cdk.App();
  const stack = new AppMasteryInternship.AppMasteryInternshipStack(
    app,
    "InternshipVPCTestStack"
  );

  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::EC2::VPC", 1);
  template.resourceCountIs("AWS::EC2::Subnet", 4);
  template.resourceCountIs("AWS::EC2::NatGateway", 1);
  template.resourceCountIs("AWS::EC2::InternetGateway", 1);
  template.resourceCountIs("AWS::EC2::VPCGatewayAttachment", 1);

  template.hasResourceProperties("AWS::EC2::VPC", {
    CidrBlock: "10.0.0.0/16",
  });

  template.hasResourceProperties("AWS::EC2::Subnet", {
    CidrBlock: "10.0.0.0/24",
    Tags: [
      {
        Key: "aws-cdk:subnet-name",
        Value: "app-mastery-public-subnet",
      },
      {
        Key: "aws-cdk:subnet-type",
        Value: "Public",
      },
      {
        Key: "Name",
        Value:
          "InternshipVPCTestStack/InternshipVPC/app-mastery-public-subnetSubnet1",
      },
    ],
  });

  template.hasResourceProperties("AWS::EC2::Subnet", {
    CidrBlock: "10.0.2.0/24",
    Tags: [
      {
        Key: "aws-cdk:subnet-name",
        Value: "app-mastery-private-subnet",
      },
      {
        Key: "aws-cdk:subnet-type",
        Value: "Private",
      },
      {
        Key: "Name",
        Value:
          "InternshipVPCTestStack/InternshipVPC/app-mastery-private-subnetSubnet1",
      },
    ],
  });
});

test("Testing ECS Cluster", () => {
  const app = new cdk.App();
  const stack = new AppMasteryInternship.AppMasteryInternshipStack(
    app,
    "InternshipECSClusterTestStack"
  );

  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::ECS::Cluster", 1);
  template.resourceCountIs("AWS::ECS::TaskDefinition", 2);
  template.resourceCountIs("AWS::ECS::Service", 2);

  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Cpu: "256",
    Memory: "512",
    ContainerDefinitions: [
      {
        Image: "amazon/amazon-ecs-sample",
        Name: "InternshipClusterContainerECSSample",
        PortMappings: [
          {
            ContainerPort: 80,
          },
        ],
      },
    ],
  });

  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Cpu: "256",
    Memory: "512",
    ContainerDefinitions: [
      {
        Name: "InternshipClusterContainerNginx",
        PortMappings: [
          {
            ContainerPort: 80,
          },
        ],
      },
    ],
  });

  template.hasResourceProperties("AWS::ECS::Service", {
    LaunchType: "FARGATE",
    LoadBalancers: [
      {
        ContainerName: "InternshipClusterContainerECSSample",
        ContainerPort: 80,
      },
    ],
  });

  template.hasResourceProperties("AWS::ECS::Service", {
    LaunchType: "FARGATE",
    LoadBalancers: [
      {
        ContainerName: "InternshipClusterContainerNginx",
        ContainerPort: 80,
      },
    ],
  });
});

test("Testing CodePipeline", () => {
  const app = new cdk.App();
  const stack = new AppMasteryInternship.AppMasteryInternshipStack(
    app,
    "InternshipCodePipelineTestStack"
  );

  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::CodePipeline::Pipeline", 1);

  template.hasResourceProperties("AWS::CodeBuild::Project", {
    Source: {
      BuildSpec: "buildspec.yml",
      Type: "CODEPIPELINE",
    },
  });

  template.hasResourceProperties("AWS::CodeDeploy::DeploymentGroup", {
    AutoRollbackConfiguration: {
      Enabled: true,
      Events: ["DEPLOYMENT_FAILURE"],
    },
    BlueGreenDeploymentConfiguration: {
      DeploymentReadyOption: {
        ActionOnTimeout: "CONTINUE_DEPLOYMENT",
        WaitTimeInMinutes: 0,
      },
      TerminateBlueInstancesOnDeploymentSuccess: {
        Action: "TERMINATE",
        TerminationWaitTimeInMinutes: 0,
      },
    },
    DeploymentConfigName: "CodeDeployDefault.ECSCanary10Percent5Minutes",
    DeploymentStyle: {
      DeploymentOption: "WITH_TRAFFIC_CONTROL",
      DeploymentType: "BLUE_GREEN",
    },
  });

  template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
    Stages: [
      {
        Actions: [
          {
            ActionTypeId: {
              Category: "Source",
              Owner: "ThirdParty",
              Provider: "GitHub",
              Version: "1",
            },
            Configuration: {
              Owner: "Dev-Destructor",
              Repo: "app-mastery-internship",
              Branch: "master",
            },
            Name: "GitHub",
            OutputArtifacts: [
              {
                Name: "Artifact_Source_GitHub",
              },
            ],
          },
        ],
        Name: "Source",
      },
      {
        Actions: [
          {
            ActionTypeId: {
              Category: "Build",
              Owner: "AWS",
              Provider: "CodeBuild",
              Version: "1",
            },
            InputArtifacts: [
              {
                Name: "Artifact_Source_GitHub",
              },
            ],
            Name: "CodeBuild",
            OutputArtifacts: [
              {
                Name: "Artifact_Build_CodeBuild",
              },
            ],
          },
        ],
        Name: "Build",
      },
      {
        Actions: [
          {
            ActionTypeId: {
              Category: "Deploy",
              Owner: "AWS",
              Provider: "CodeDeployToECS",
              Version: "1",
            },
            Configuration: {
              AppSpecTemplateArtifact: "Artifact_Build_CodeBuild",
              AppSpecTemplatePath: "appspec.yaml",
            },
            InputArtifacts: [
              {
                Name: "Artifact_Build_CodeBuild",
              },
            ],
            Name: "CodeDeploy",
          },
        ],
        Name: "Deploy",
      },
    ],
  });
});
