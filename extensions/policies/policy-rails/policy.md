# Rails policy

The stack is Ruby 4, Rails 8.1 or later, Hotwire, Importmap, Propshaft, the Solid Trifecta and Minitest. When in doubt, check the [Rails guides](https://guides.rubyonrails.org/) and [Code I Like](https://dev.37signals.com/series/code-i-like/).

## Convention over configuration

- **Use generators first:** `bin/rails g model|controller|migration|job|mailer`. Do not hand-write what Rails generates.
- **Put the Rails version in the migration bracket.** Take it from `Gemfile.lock`, such as `ActiveRecord::Migration[8.1]` on 8.1. Never leave the bracket out.
- **Follow Rails naming.** Models are singular (`User`), controllers plural (`UsersController`) and tables plural (`users`). Foreign keys are `user_id`, and join tables are alphabetical (`groups_users`).
- Read config from credentials or `config.x`, never from `ENV["X"]` at the call site.

## Controllers

- **Use CRUD actions only:** `index`, `show`, `new`, `create`, `edit`, `update` and `destroy`. An action that fits none of them is a new resource, not a custom action.
- **Call models directly from controllers.** Use plain Active Record for simple cases, and a model method that names the intent for complex ones: `@bundle.deliver`.
- Put **strong params** in a private method, and always use `require().permit()`.
- Use `form_with`, never `form_for` or `form_tag`.
- Call `redirect_to` after a change, and `render` when validation fails.

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

- **Keep models rich.** Put all business logic in models, mixing persistence and domain. Do not write service objects, `app/services/` or interactors. Callers always call the model: `mail_account.collect_now`, not `MailAccountCollectionService.new(mail_account).call`.
- **Put POROs in `app/models/` too.** Form objects, value objects and operation objects are domain models without a table.
- Put validations in models, never in controllers.
- Use scopes for reusable queries and class methods for complex ones.
- Use an enum for any fixed set of values. Back it with a string column and `.index_by(&:itself)`, and add `suffix:` or `prefix:` when it reads better.
- Use `encrypts :field` for sensitive attributes.
- Do not write raw SQL. Use the Active Record query interface, and Arel when that is not enough.

```ruby
add_column :posts, :status, :string, null: false
enum :status, %w[draft published archived].index_by(&:itself), suffix: true
```

### Concerns

Put concerns shared across models in `app/models/concerns/` (`Taggable`), and concerns for one model in `app/models/<model>/` (`MailAccount::Collecting`).

- Give each concern one responsibility: a real trait, something the model "has" or "acts as". Never use a concern as a place for leftovers.
- Make the model file mostly declarations: associations, validations, scopes and includes.
- Hand complex operations from the concern to a PORO, so the model stays a facade over a subsystem.
- A thin concern can give access to a group of POROs: `user.notifications.granularity.choice`.

### Callbacks

- In a callback, decide whether work is needed, then hand the work to a job. Never block the request.
- Use `after_save` to inspect changed attributes inside the transaction, and `after_commit` to start work after it. Prefer the specific forms, such as `after_create_commit`.
- Give every callback system a way to turn it off for imports, copies and seeds: `Mention::Eavesdropper.suppressed { import_old_data }`.

### Current

Keep request context, such as the account, the user and request details, in `Current` instead of passing it through five layers. Keep `Current` small.

## Associations

- Declare both sides.
- Set `dependent:` on every `has_many` and `has_one`: `destroy`, `delete_all`, `nullify` or `restrict_with_error`.
- Use `has_many :through`, never `has_and_belongs_to_many`.

## Migrations

- Give each migration one concern. Never mix creating a table with changing data.
- Make migrations reversible with `change`, or with `up` and `down`. Test the rollback.
- Index foreign keys and every column you query.
- Never edit a migration that has been pushed. Write a new one.

## Routes

- Use `resources` and `resource`, not hand-written `get` and `post`.
- Nest one level at most. Use shallow nesting once the child has its own identity.
- Use `only:` or `except:` to limit what is exposed.
- Use singular `resource` for things that exist once per user, such as a session, settings or a profile.

## Jobs

Keep jobs shallow. Have `perform` call a model method, and keep the logic in the model. Name the method that enqueues the job `<verb>_later`, and the one that runs it now `<verb>_now`.

## Scripts

Write everything around the app in Ruby, including setup, CI, one-off scripts and data fixes. Do not use bash, Python or Node. The only exceptions are the shipped `bin/dev` and `bin/docker-entrypoint`, which run before Ruby is usable.

- Put the logic in a class under `lib/`. Keep the entry point to parsing `ARGV` and calling that class.
- Write a script that needs Rails as a rake task in `lib/tasks/*.rake`, run as `bin/rails sitemap:check`. Put a script that does not need Rails in `bin/` with `#!/usr/bin/env ruby`, and load only its gems.
- Expose a simple script both ways, as `bin/smart_quotes find` and `rake smart_quotes:find`, so CI can call the fast one.

## Views

- Use partials for reuse. Name them with a `_` prefix and pass locals explicitly. Never use instance variables in partials.
- Put view logic in helpers, not in templates or models.
- Use Turbo Frames for partial updates, Turbo Streams to update several targets, and Stimulus for behavior.

## Tests

- Use Minitest and fixtures. Do not use RSpec, FactoryBot, mocks or stubs, and do not bend production code to make it testable.
- External HTTP is the one exception. Use VCR cassettes on top of WebMock: record them once against the real service, then replay them everywhere else. Never hand-write a response stub.
- Test webhooks the way they arrive: post a signed request from an integration test (`post_stripe_webhook`). At record time, `vcr_stripe_webhook` drives the real Stripe CLI.
- Use the real database, let callbacks run and render real views. A model test that takes half a second is fine.
- Fixtures are a shared cast of characters that any test can use. Create objects that only one test needs inside that test.
- Test one aspect, not one assertion. Two to four assertions per test is normal. `assert` and `assert_equal` cover almost everything.
- Write controller tests as integration tests: send a request and assert on the response HTML.
- Mirror the app tree: `app/models/user.rb` is tested in `test/models/user_test.rb`, and `Recording::Lockable` in `test/models/recording/lock_test.rb`.
- Write system tests with Capybara for user flows that need JS.

## Authentication

Run `bin/rails generate authentication`, which gives you `has_secure_password`, a `Session` model and `Current.user`. Do not build your own, and do not add Devise.

## Frontend

- Use Importmap, with no Node and no bundler.
- Use Propshaft, not Sprockets. Do not write an `application.css` manifest or a CSS `@import`, because `@import` fails silently.
- `stylesheet_link_tag :app` loads every file in `app/assets/stylesheets/`, with one `<link>` per file.
- Declare the `@layer` order in `_global.css`, which loads first.

## Ruby style

- Indent with two spaces. Use double quotes, `%i[]` and `%w[]`, hash shorthand `{ x:, y: }`, and endless methods for one-liners.
- **Prefer expanded conditionals to guard clauses.** A guard is fine only at the very top of a method whose body is several lines long.

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

- **Order methods in a class** this way: class methods, then public methods with `initialize` first, then private methods.
- **Leave no blank line under a visibility modifier**, and indent the methods that follow it. In a module that is entirely private, put `private` at the top, add a blank line, and do not indent.
- **Use `!` only on a method that also has a version without it.** Do not use `!` to mark a destructive method.
- Debug with `Rails.logger.debug`, never with `puts` or `p`.
