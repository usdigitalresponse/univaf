# S3 Buckets
#
# The API server stores historical logs and daily snapshots of the databse in
# S3 for later analysis. This data, like the API is publicly accessible.

resource "aws_s3_bucket" "data_snapshots" {
  bucket = "univaf-data-snapshots"
}

# FIXME: Change acl to "private" once we confirm CloudFront is working.
resource "aws_s3_bucket_acl" "data_snapshots_acl" {
  bucket = aws_s3_bucket.data_snapshots.id
  acl    = "public-read"
}

# FIXME: Remove policy once we confirm CloudFront is working.
resource "aws_s3_bucket_policy" "data_snapshots" {
  bucket = aws_s3_bucket.data_snapshots.id
  policy = jsonencode({
    Version = "2008-10-17"
    Id      = "Policy8542383977173"
    Statement = [{
      Sid       = "PublicReadAccess"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.data_snapshots.arn}/*"
    }]
  })
}

# Alternative deployments that are being tested write to this bucket instead.
resource "aws_s3_bucket" "render_test_data_snapshots" {
  bucket = "univaf-render-test-data-snapshots"
}

resource "aws_s3_bucket_acl" "render_test_data_snapshots_acl" {
  bucket = aws_s3_bucket.render_test_data_snapshots.id
  acl    = "public-read"
}

resource "aws_s3_bucket_policy" "render_test_data_snapshots" {
  bucket = aws_s3_bucket.render_test_data_snapshots.id
  policy = jsonencode({
    Version = "2008-10-17"
    Id      = "Policy8542383977174"
    Statement = [{
      Sid       = "PublicReadAccess"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.render_test_data_snapshots.arn}/*"
    }]
  })
}
