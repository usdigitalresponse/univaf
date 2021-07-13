
# The bastion server was manually created
# this security group is associated with the server through the console.
resource "aws_security_group" "bastion_security_group" {

  name        = "bastion-security"
  description = "Allows SSH access to bastion server"
  vpc_id      = aws_vpc.main.id

  ingress {
    description      = ""
    from_port        = 22
    to_port          = 22
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
  }
}
