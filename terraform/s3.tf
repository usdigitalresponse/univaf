# S3 Buckets
#
# The API server stores historical logs and daily snapshots of the database in
# S3 for later analysis. It is publicly available via CloudFront, which reads
# from the bucket.

resource "aws_s3_bucket" "data_snapshots" {
  bucket = var.data_snapshot_s3_bucket
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

resource "aws_s3_bucket_versioning" "data_snapshots" {
  bucket = aws_s3_bucket.data_snapshots.id
  versioning_configuration {
    status = "Enabled"
  }
}
