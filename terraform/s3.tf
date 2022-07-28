# S3 Buckets and Policies
#
# The univaf-data-snapshots bucket is a public-readable bucket that stores
# logfiles of all our updates and daily snapshots of the database for use in
# historical analysis.

resource "aws_s3_bucket" "data_snapshots" {
  bucket = "univaf-data-snapshots"
}

resource "aws_s3_bucket_acl" "data_snapshots_acl" {
  bucket = aws_s3_bucket.data_snapshots.id
  acl    = "public-read"
}

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
