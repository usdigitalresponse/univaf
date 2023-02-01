# S3 Buckets
#
# The API server stores historical logs and daily snapshots of the database in
# S3 for later analysis. It is publicly available via CloudFront, which reads
# from the bucket.

resource "aws_s3_bucket" "data_snapshots" {
  bucket = "univaf-data-snapshots"
}

resource "aws_s3_bucket_acl" "data_snapshots_acl" {
  bucket = aws_s3_bucket.data_snapshots.id
  acl    = "private"
}

resource "aws_s3_bucket_lifecycle_configuration" "data_snapshots" {
  bucket = aws_s3_bucket.data_snapshots.id

  rule {
    id     = "Delete old incomplete multipart uploads"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
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

resource "aws_s3_bucket_lifecycle_configuration" "render_test_data_snapshots" {
  bucket = aws_s3_bucket.render_test_data_snapshots.id

  rule {
    id     = "Delete old incomplete multipart uploads"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
