declare module "JSONStream" {
  import { Duplex } from "node:stream";

  function stringify(
    open?: string | false,
    sep?: string,
    close?: string
  ): Duplex;
}
