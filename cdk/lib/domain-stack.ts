import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface DomainStackProps extends cdk.StackProps {
  envName: string;
  customDomain: string;
}

export class DomainStack extends cdk.Stack {
  public readonly hostedZone: route53.HostedZone;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    const { envName, customDomain } = props;

    // Create hosted zone for the custom domain
    this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: customDomain,
    });

    // Create ACM certificate with DNS validation
    // This will block until DNS records propagate after user configures delegation
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: customDomain,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Outputs
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', this.hostedZone.hostedZoneNameServers!),
      description: 'NS records to configure at your domain registrar',
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
    });
  }
}
