# Network Configuration
#
# This creates one VPC for all services, with one public and one private subnet
# in each availability zone (how many zones comes from the `az_count` variable).
# Services that don't need to be reachable from the public internet
# (e.g. the database) run in the private networks.

# Fetch AZs in the current region
data "aws_availability_zones" "available" {}

resource "aws_vpc" "main" {
  cidr_block = "172.17.0.0/16"

  tags = {
    Name = "univaf-vpc"
  }
}


# Public Network --------------------------------------------------------------

# The "public" subnets have an internet gateway and automatically assign public
# IP addresses to any services in them. Services here can reach out to the
# internet and things on the internet can reach them, so anything running in
# these subnets should be protected with narrowly-focused security groups.
resource "aws_subnet" "public" {
  count                   = var.az_count
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, var.az_count + count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  vpc_id                  = aws_vpc.main.id
  map_public_ip_on_launch = true

  tags = {
    Name = "univaf-public-${count.index}"
  }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
}

# Route the public subnet traffic through the internet gateway above.
resource "aws_route" "internet_access" {
  route_table_id         = aws_vpc.main.main_route_table_id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.gw.id
}


# Private Network -------------------------------------------------------------

# The "private" subnets do not automatically assign services public IPs and do
# not have any gateway to the public internet. Only other services in our VPC
# (any subnet) can communicate with things in it.
resource "aws_subnet" "private" {
  count             = var.az_count
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  vpc_id            = aws_vpc.main.id

  tags = {
    Name = "univaf-private-${count.index}"
  }
}
