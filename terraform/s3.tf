# s3.tf

resource "aws_s3_bucket" "data_snapshots" {
  bucket = "univaf-data-snapshots"
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
      Resource  = "arn:aws:s3:::univaf-data-snapshots/*"
    }]
  })
}
