terraform {
  backend "remote" {
    organization = "usdr"

    workspaces {
      name = "appointment-availability-infra"
    }
  }
}
