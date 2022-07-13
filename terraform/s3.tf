# s3.tf

locals {
  data_snapshot_bucket_names = toset([
    "univaf-data-snapshots",
    "univaf-render-test-data-snapshots",
  ])
}

resource "aws_s3_bucket" "data_snapshots" {
  for_each = local.data_snapshot_bucket_names
  bucket = each.key
}

resource "aws_s3_bucket_acl" "data_snapshots_acl" {
  for_each = aws_s3_bucket.data_snapshots
  bucket = each.value.id
  acl    = "public-read"
}

resource "aws_s3_bucket_policy" "data_snapshots" {
  for_each = aws_s3_bucket.data_snapshots
  bucket = each.value.id
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
