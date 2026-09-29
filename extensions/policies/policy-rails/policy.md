# Rails policy

Ruby 4, Rails 8.1 or later, Hotwire, Importmap, Propshaft, Solid Trifecta, Minitest. When in doubt, check the [Rails guides](https://guides.rubyonrails.org/) and [Code I Like](https://dev.37signals.com/series/code-i-like/).

## Convention over configuration

- **Generators first.** `bin/rails g model|controller|migration|job|mailer`. Do not hand-write what Rails generates.
- **Migration version bracket.** The app's Rails version from `Gemfile.lock`, `ActiveRecord::Migration[8.1]` on 8.1, never bare.
- **Naming.** Models singular (`User`), controllers plural (`UsersController`), tables plural (`users`), foreign keys `user_id`, join tables alphabetical (`groups_users`).
- Config through credentials or `config.x`, never `ENV["X"]` read at the call site.

## Controllers

- **CRUD only.** `index`, `show`, `new`, `create`, `edit`, `update`, `destroy`. An action that maps to none of them is a new resource, not a custom action.
- **Controllers talk to models directly.** Plain Active Record for simple cases, an intention-revealing model method for complex ones: `@bundle.deliver`.
- **Strong params** in a private method, always `require().permit()`.
- `form_with`, never `form_for` or `form_tag`.
- `redirect_to` after a mutation, `render` on validation failure.

```ruby
# no: custom action
resources :mail_accounts do
  post :verify
end

# yes: new resource
resources :mail_accounts do
  resource :verification, only: :create
end
```

## Models

- **Rich models.** All business logic lives in models, persistence and domain blended. No service objects, no `app/services/`, no interactors. The caller always sees the model: `mail_account.collect_now`, not `MailAccountCollectionService.new(mail_account).call`.
- **POROs belong in `app/models/` too.** Form objects, value objects, operation objects are domain models without a table.
- Validations in models, never in controllers.
- Scopes for reusable queries, class methods for complex ones.
- Enums for any fixed set of values. String-backed: string column, `.index_by(&:itself)`, `suffix:` or `prefix:` when it reads better.
- `encrypts :field` for sensitive attributes.
- No raw SQL. Active Record query interface, Arel when it is not enough.

```ruby
add_column :posts, :status, :string, null: false
enum :status, %w[draft published archived].index_by(&:itself), suffix: true
```

### Concerns

Two kinds: shared across models in `app/models/concerns/` (`Taggable`), model-specific in `app/models/<model>/` (`MailAccount::Collecting`).

- Every concern has genuine "has trait" or "acts as" semantics, one cohesive responsibility. Not a bucket for leftovers.
- The model file is mostly declarations: associations, validations, scopes, includes.
- Complex operations delegate from the concern to a PORO. The model is a facade over a subsystem.
- A thin concern can be a gateway onto composed POROs: `user.notifications.granularity.choice`.

### Callbacks

- Callback decides whether work is needed, then a job does the work. Never block the request.
- Two steps: `after_save` to inspect dirty attributes inside the transaction, `after_commit` to trigger work after it. Prefer `after_create_commit` and friends for specificity.
- Every callback system needs an opt-out for imports, copies and seeds: `Mention::Eavesdropper.suppressed { import_old_data }`.

### Current

`Current` holds request-scoped context (account, user, request details) instead of threading it through five layers. Keep it small.

## Associations

- Declare both sides.
- `dependent:` on every `has_many` and `has_one`: `destroy`, `delete_all`, `nullify`, or `restrict_with_error`.
- `has_many :through`, never `has_and_belongs_to_many`.

## Migrations

- One concern per migration. Never mix table creation with data manipulation.
- Reversible: `change`, or `up`/`down`. Test the rollback.
- Index foreign keys and anything you query.
- Never edit a migration that has been pushed. Write a new one.

## Routes

- `resources` and `resource`, not hand-written `get`/`post`.
- One level of nesting. Shallow nesting once the child has its own identity.
- `only:` / `except:` to limit what is exposed.
- Singular `resource` for things that exist once per user: session, settings, profile.

## Jobs

Shallow jobs: `perform` calls a model method, the logic stays in the model. `_later` enqueues, `_now` executes.

## Scripts

Everything around the app is Ruby: setup, CI, one-offs, data fixes. No bash, no Python, no Node. Exception: the shipped `bin/dev` and `bin/docker-entrypoint`, which run before Ruby is usable.

- Logic lives in a class under `lib/`. The entry point only parses `ARGV` and calls it.
- Needs Rails loaded: `lib/tasks/*.rake`, run as `bin/rails sitemap:check`. Does not: `bin/`, `#!/usr/bin/env ruby`, booting gems only.
- Expose a simple script both ways, `bin/smart_quotes find` and `rake smart_quotes:find`, so CI can call the fast one.

## Views

- Partials for reuse, prefixed `_`, locals passed explicitly. No instance variables in partials.
- View logic in helpers, not in templates and not in models.
- Turbo Frames for partial updates, Turbo Streams for multi-target updates, Stimulus for behavior.

## Tests

- Minitest and fixtures. No RSpec, no FactoryBot, no mocks, no stubs, no production code bent to be testable.
- External HTTP is the one exception: VCR cassettes over WebMock, recorded once against the real service, replayed everywhere else. Never hand-write a response stub.
- Webhooks enter through the front door: an integration test posts a signed request (`post_stripe_webhook`), with `vcr_stripe_webhook` driving the real Stripe CLI at record time.
- Hit the real database, let callbacks run, render real views. Half a second for a model test is fine.
- Fixtures are a shared world of characters to pull from. Objects specific to one test are created inline.
- Test one aspect, not one assertion. Two to four assertions per test is normal. `assert` and `assert_equal` cover almost everything.
- Controller tests are integration tests: request, response, HTML assertion.
- Mirror the app tree: `app/models/user.rb` to `test/models/user_test.rb`, `Recording::Lockable` to `test/models/recording/lock_test.rb`.
- System tests with Capybara for user flows that need JS.

## Authentication

`bin/rails generate authentication`: `has_secure_password`, `Session` model, `Current.user`. Do not roll your own. Do not add Devise.

## Frontend

- Importmap. No Node, no bundler.
- Propshaft. No Sprockets, so no `application.css` manifest and no CSS `@import`, which fails silently.
- `stylesheet_link_tag :app` bulk-loads `app/assets/stylesheets/`, one `<link>` per file.
- Declare the `@layer` order in `_global.css`, which sorts first.

## Ruby style

- Two-space indent, double quotes, `%i[]` and `%w[]`, hash shorthand `{ x:, y: }`, endless methods for one-liners.
- **Expanded conditionals over guard clauses.** A guard is fine only at the very top of a method whose body is several lines.

```ruby
# no
return [] unless ids
@bucket.recordings.todos.find(ids.split(","))

# yes
if ids
  @bucket.recordings.todos.find(ids.split(","))
else
  []
end
```

- **Method order in a class:** class methods, then public with `initialize` first, then private.
- **No newline under a visibility modifier**, indent what follows it. A module that is entirely private marks `private` at the top, adds a blank line, and does not indent.
- **`!` only for a method that has a counterpart without it.** Not a marker for destructive.
- `Rails.logger.debug`, never `puts` or `p`, for debugging.
