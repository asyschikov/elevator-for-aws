resource "aws_cloudfront_origin_access_identity" "website" {
  comment = "OAI for Elevator website - ${var.env_name}"
}

resource "aws_cloudfront_distribution" "website" {
  comment             = "Elevator Distribution - ${var.env_name}"
  enabled             = true
  default_root_object = "index.html"
  aliases             = local.has_domain ? [var.custom_domain] : []

  origin {
    origin_id   = "website-s3"
    domain_name = aws_s3_bucket.website.bucket_regional_domain_name

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.website.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    target_origin_id       = "website-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    # AWS managed "CachingOptimized" policy.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # SPA routing: serve index.html for client-side routes.
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.has_domain ? null : true
    acm_certificate_arn            = local.has_domain ? data.aws_acm_certificate.website[0].arn : null
    ssl_support_method             = local.has_domain ? "sni-only" : null
    minimum_protocol_version       = local.has_domain ? "TLSv1.2_2021" : null
  }
}

locals {
  cloudfront_domain = aws_cloudfront_distribution.website.domain_name
  app_domain        = local.has_domain ? var.custom_domain : local.cloudfront_domain
  site_url          = "https://${local.cloudfront_domain}/"
  external_url      = local.has_domain ? "https://${var.custom_domain}/" : ""
  primary_login_url = local.has_domain ? local.external_url : local.site_url

  callback_urls = compact([
    local.site_url,
    var.allow_localhost ? "http://localhost:5173/" : "",
    local.external_url,
  ])
}
