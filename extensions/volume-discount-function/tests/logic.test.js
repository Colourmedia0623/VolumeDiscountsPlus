/* eslint-env node */
// Fast tests that run the function's JavaScript directly against every fixture
// and check each fixture against the schema and input query, without compiling
// to WebAssembly. default.test.js runs the same fixtures through the real Wasm
// build (it downloads build tools from Shopify's CDN).
import path from "path";
import fs from "fs";
import { describe, test, expect, beforeAll } from "vitest";
import {
  loadSchema,
  loadInputQuery,
  loadFixture,
  validateTestAssets,
} from "@shopify/shopify-function-test-helpers";
import { cartLinesDiscountsGenerateRun } from "../src/cart_lines_discounts_generate_run";

const root = path.dirname(__dirname);
const fixturesDir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

describe("tier logic", () => {
  let schema;
  let inputQueryAST;

  beforeAll(async () => {
    schema = await loadSchema(path.join(root, "schema.graphql"));
    inputQueryAST = await loadInputQuery(
      path.join(root, "src/cart_lines_discounts_generate_run.graphql"),
    );
  });

  for (const file of files) {
    test(file, async () => {
      const fixture = await loadFixture(path.join(fixturesDir, file));

      const validation = await validateTestAssets({ schema, fixture, inputQueryAST });
      expect(validation.inputQuery.errors).toEqual([]);
      expect(validation.inputFixture.errors).toEqual([]);
      expect(validation.outputFixture.errors).toEqual([]);

      expect(cartLinesDiscountsGenerateRun(fixture.input)).toEqual(fixture.expectedOutput);
    });
  }
});
