import providers from "../fixtures/providers";
import { Availability, Provider } from "./interfaces";

/**
 * Lists all providers
 * @returns Provider[]
 */

async function list(): Promise<Provider[]> {
  return new Promise<Provider[]>((resolve, reject) => {
    resolve(providers);
  });
}

/**
 * Returns a single provider based upon its id (or undefined)
 * @param id
 * @returns Provider | undefined
 */

async function getById(id: string): Promise<Provider | undefined> {
  return new Promise<Provider | undefined>((resolve, reject) => {
    resolve(providers.find((p) => p.id === id));
  });
}

/**
 * Updates a given location's availability based upon its id
 * @param id
 * @param availability
 * @returns
 */

async function update(
  id: string,
  availability: Availability
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const provider = providers.find((p) => p.id === id);
    if (!provider) {
      return reject("not found");
    }
    provider.availability = availability;
    provider.lastChecked = new Date();
    resolve(true);
  });
}

export { list, getById, update };
