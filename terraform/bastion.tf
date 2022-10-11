# Bastion Server
#
# To access to services running on a private subnet, you can SSH into the
# "bastion" server (which is in one of the public subnets and can see into the
# private ones) and do your work from that SSH session.
#
# The bastion server itself is manually created, and uses this security group.
resource "aws_security_group" "bastion_security_group" {

  name        = "bastion-security"
  description = "Allows SSH access to bastion server"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = ""
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
