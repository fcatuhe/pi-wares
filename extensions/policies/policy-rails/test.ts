import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { railsVersion, refusal } from "./check.ts";

const app = () => {
  const root = mkdtempSync(join(tmpdir(), "policy-rails-"));
  mkdirSync(join(root, "db/migrate"), { recursive: true });
  mkdirSync(join(root, "config"));
  writeFileSync(join(root, "config/application.rb"), "");
  writeFileSync(join(root, "Gemfile.lock"), "GEM\n  specs:\n    rails (8.1.3.1)\n      actioncable (= 8.1.3.1)\n");
  return root;
};

const migration = (bracket: string) => `class AddStatusToPosts < ActiveRecord::Migration${bracket}\n  def change\n  end\nend\n`;

test("the Rails version is read from the Gemfile.lock above the file, major and minor only", () => {
  const root = app();
  assert.equal(railsVersion(join(root, "db/migrate")), "8.1");
  const gem = mkdtempSync(join(tmpdir(), "policy-rails-"));
  writeFileSync(join(gem, "Gemfile.lock"), "GEM\n  specs:\n    rake (13.3.0)\n");
  assert.equal(railsVersion(gem), undefined, "the nearest lockfile decides, even without Rails in it");
});

test("a migration on the app's version passes, a bare or stale superclass is refused", () => {
  const path = join(app(), "db/migrate/20260929000000_add_status_to_posts.rb");
  assert.equal(refusal(path, [migration("[8.1]")]), undefined);
  for (const bracket of ["", "[7.1]"]) {
    assert.match(refusal(path, [migration(bracket)])?.reason ?? "", /ActiveRecord::Migration\[8\.1\], the Rails version in Gemfile\.lock/);
  }
});

test("anything that is not a migration superclass in db/migrate is left alone", () => {
  const root = app();
  assert.equal(refusal(join(root, "app/models/post.rb"), [migration("")]), undefined);
  assert.equal(refusal(join(root, "db/migrate/20260929000000_x.rb"), ["  add_index :posts, :status"]), undefined);
  const gem = mkdtempSync(join(tmpdir(), "policy-rails-"));
  writeFileSync(join(gem, "Gemfile.lock"), "GEM\n  specs:\n    rake (13.3.0)\n");
  assert.equal(refusal(join(gem, "db/migrate/20260929000000_x.rb"), [migration("")]), undefined, "no Rails version, no verdict");
});

test("the extension checks write and edit in a Rails app", async () => {
  const root = app();
  process.chdir(root);
  const handlers: Record<string, (event: unknown) => Promise<unknown>> = {};
  (await import("./index.ts")).default({ on: (event: string, fn: never) => (handlers[event] = fn) } as never);
  const call = (toolName: string, input: object) => handlers.tool_call({ toolName, input });
  const path = "db/migrate/20260929000000_add_status_to_posts.rb";
  assert.equal(((await call("write", { path, content: migration("") })) as { block: boolean }).block, true);
  assert.equal(((await call("edit", { path, edits: [{ newText: migration("[7.2]") }] })) as { block: boolean }).block, true);
  assert.equal(await call("write", { path, content: migration("[8.1]") }), undefined);
  assert.equal(await call("bash", { command: migration("") }), undefined);
});
