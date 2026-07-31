# Custom-domain support. Mirrors the CDK stack: an ISSUED ACM certificate (in
# us-east-1, for CloudFront) and a Route53 hosted zone for the domain must already
# exist. Create them once beforehand (e.g. via deployment/02-create-domain-and-cert.sh
# or your own process), then set var.custom_domain.

data "aws_acm_certificate" "website" {
  count       = local.has_domain ? 1 : 0
  provider    = aws.us_east_1
  domain      = var.custom_domain
  statuses    = ["ISSUED"]
  most_recent = true
}

data "aws_route53_zone" "website" {
  count        = local.has_domain ? 1 : 0
  name         = "${var.custom_domain}."
  private_zone = false
}

resource "aws_route53_record" "website" {
  count   = local.has_domain ? 1 : 0
  zone_id = data.aws_route53_zone.website[0].zone_id
  name    = var.custom_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website.domain_name
    zone_id                = aws_cloudfront_distribution.website.hosted_zone_id
    evaluate_target_health = false
  }
}
