# s3.tf

resource "aws_s3_bucket" "data_snapshots" {
  bucket = "univaf-data-snapshots"
  acl    = "public-read"
}

