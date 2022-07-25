# Bastion Server
#
# The bastion server has access to our private networks and services, but is
# accessible from public networks (this is also often referred to as a
# "jump box").
#
# We use it to manually log in and run scripts, investigate issues, or make DB
# queries. (We try and avoid this, though! Whenever possible, these tasks should
# be accomplished by versioned code, like migrations.)

# The bastion server (an EC2 instance) was manually created. This security group
# is associated with it through the AWS web console.
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
