# Rails Conventions

Ruby 4, Rails 8.1, Hotwire, Importmap, Propshaft, Solid Trifecta, Minitest. When in doubt, check the [Rails guides](https://guides.rubyonrails.org/) and [Code I Like](https://dev.37signals.com/series/code-i-like/).

## Convention over configuration

- **Generators first.** `bin/rails g model|controller|migration|job|mailer`. Do not hand-write what Rails generates.
- **Migration version bracket.** `ActiveRecord::Migration[8.1]`, never bare.
- **Naming.** Models singular (`User`), controllers plural (`UsersController`), tables plural (`users`), foreign keys `user_id`, join tables alphabetical (`groups_users`).

## Controllers

- **CRUD only.** `index`, `show`, `new`, `create`, `edit`, `update`, `destroy`. An action that does not map to one of those means you need a new resource, not a custom action.
- **Controllers talk to models directly.** Plain Active Record for simple cases, an intention-revealing model method for complex ones. No service layer between them.
- **Strong params** in a private method, always `require().permit()`.
- `form_with`. `form_for` and `form_tag` still ship in 8.1 but are legacy: never write new ones.
- `redirect_to` after a mutation, `render` on validation failure.

```ruby
# ✗ Custom action
resources :mail_accounts do
  post :verify
end

# ✓ New resource
resources :mail_accounts do
  resource :verification, only: :create
end

# ✓ Simple CRUD, plain Active Record
def create
  @mail_account = Current.user.mail_accounts.create!(mail_account_params)
end

# ✓ Complex behavior, the model hides it
def create
  @bundle.deliver
end
```

## Models

- **Rich models.** All business logic lives in models. No service objects, no `app/services/`, no interactors, no use cases. Ever.
- **Active Record, nice and blended.** Do not separate persistence from domain logic. That blend is the point.
- **POROs belong in `app/models/` too.** Form objects, value objects, operation objects are domain models without a table.
- **Domain driven boldness.** `person.decease`, not `person.soft_delete`. `contact.designate_to(box)`, not `ContactBoxAssigner.call`. Use a dictionary.
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

- Every concern has genuine "has trait" or "acts as" semantics. Not a bucket for leftovers.
- One cohesive responsibility per concern.
- The model file is mostly declarations: associations, validations, scopes, includes.
- Complex operations delegate from the concern to a PORO. The model is a facade over a subsystem.

```ruby
# app/models/mail_account.rb, declarations only
class MailAccount < ApplicationRecord
  include Collecting, Verifiable

  belongs_to :user
  has_many :collected_messages, dependent: :destroy

  validates :address, presence: true
  scope :active, -> { where(active: true) }
end

# app/models/mail_account/collecting.rb, one responsibility
module MailAccount::Collecting
  extend ActiveSupport::Concern

  def collect_later
    MailAccount::CollectJob.perform_later(self)
  end

  def collect_now
    Collection.new(self).run
  end
end
```

The caller always sees the model:

```ruby
# ✓ mail_account.collect_now
# ✗ MailAccountCollectionService.new(mail_account).call
```

A thin concern can also act as an API gateway onto composed POROs:

```ruby
module User::Notifyee
  extend ActiveSupport::Concern

  def notifications = @notifications ||= Notifications.new(self)
end

# current.user.notifications.granularity.choice
```

### Callbacks

Callbacks are not a smell. They are how auxiliary complexity stays off the main path.

- Callback decides whether work is needed, then a job does the work. Never block the request.
- Two steps: `after_save` to inspect dirty attributes inside the transaction, `after_commit` to trigger work after it.
- Prefer `after_create_commit` / `after_update_commit` / `after_destroy_commit` when you need specificity.
- Every callback system needs an opt-out for imports, copies and seeds: `Mention::Eavesdropper.suppressed { import_old_data }`.

### Current

`Current` is a sharp knife for request-scoped context: account, user, request details. Use it instead of threading those through five layers. Keep it small, not 15 attributes.

## Associations

- Declare both sides.
- `dependent:` on every `has_many` and `has_one`: `destroy`, `delete_all`, `nullify`, or `restrict_with_error`.
- `has_many :through`, never `has_and_belongs_to_many`.

## Migrations

- One concern per migration. Never mix table creation with data manipulation.
- Reversible: `change`, or `up`/`down`. Test the rollback.
- `decimal` or integer cents for money, `string` for short text, `text` for long.
- Index foreign keys and anything you query.
- Never edit a migration that has been pushed. Write a new one.

## Routes

- `resources` and `resource`, not hand-written `get`/`post`.
- One level of nesting. Shallow nesting once the child has its own identity.
- `only:` / `except:` to limit what is exposed.
- Singular `resource` for things that exist once per user: session, settings, profile.

## Jobs

Shallow jobs. `perform` calls a model method, the logic stays in the model. `_later` enqueues, `_now` executes.

```ruby
class MailAccount::CollectJob < ApplicationJob
  def perform(mail_account) = mail_account.collect_now
end
```

## Views

- Partials for reuse, prefixed `_`, locals passed explicitly. No instance variables in partials.
- View logic in helpers, not in templates and not in models.
- Turbo Frames for partial updates, Turbo Streams for multi-target updates.
- Stimulus for behavior. No inline JS.

## Tests

- Minitest and fixtures. No RSpec, no FactoryBot, no mocks, no stubs.
- External HTTP is the one exception: VCR cassettes over WebMock, recorded once against the real service, replayed everywhere else. Never hand-write a response stub.
- Webhooks enter through the front door: an integration test posts a signed request (`post_stripe_webhook`), with `vcr_stripe_webhook` driving the real Stripe CLI at record time.
- Hit the real database, let callbacks run, render real views.
- Fixtures are a shared world of characters to pull from. Objects specific to one test are created inline.
- Test one aspect, not one assertion. Two to four assertions per test is normal. `assert` and `assert_equal` cover almost everything.
- Controller tests are integration tests: request, response, HTML assertion.
- Never distort production code to make it testable. No injected dependencies, no interfaces for mocking.
- Fast enough beats blazing fast. Half a second for a model test is fine.
- Mirror the app tree: `app/models/user.rb` to `test/models/user_test.rb`, `Recording::Lockable` to `test/models/recording/lock_test.rb`.
- System tests with Capybara for user flows that need JS.

## Authentication

`bin/rails generate authentication`: `has_secure_password`, `Session` model, `Current.user`. Do not roll your own. Do not add Devise.

## Frontend

- Importmap. No Node, no bundler.
- Propshaft. No Sprockets, so no `application.css` manifest and no CSS `@import`, which fails silently.
- `stylesheet_link_tag :app` bulk-loads `app/assets/stylesheets/`, one `<link>` per file.
- Order with `@layer`, declared in `_global.css` (underscore sorts first). Each file wraps its rules in a layer.
- Vanilla CSS and Stimulus. No jQuery, no Tailwind unless the project says so.

## Ruby style

- Two-space indent, double quotes, `%i[]` and `%w[]`, hash shorthand `{ x:, y: }`, endless methods for one-liners.
- **Expanded conditionals over guard clauses.** Guards are hard to read once nested.

```ruby
# ✗
return [] unless ids
@bucket.recordings.todos.find(ids.split(","))

# ✓
if ids
  @bucket.recordings.todos.find(ids.split(","))
else
  []
end
```

  A guard clause is fine when it sits at the very top of the method and the body below it is several lines.

- **Method order in a class:** class methods, then public with `initialize` first, then private.
- **No newline under a visibility modifier**, indent what follows it. A module that is entirely private marks `private` at the top, adds a blank line, and does not indent.
- **`!` only for a method that has a counterpart without it.** Not a marker for destructive.
- Notes use `bin/rails notes` tags: `# TODO: fc 30jul26 description`.

## Common AI mistakes

```
✗ form_for / form_tag                        -> ✓ form_with
✗ before_filter                              -> ✓ before_action
✗ attr_accessible                            -> ✓ strong params
✗ render text: / render nothing              -> ✓ render plain: / head :ok
✗ find_by_id                                 -> ✓ find (raises) or find_by (nil)
✗ update_attributes                          -> ✓ update
✗ .where(id: x).first                        -> ✓ .find(x) or .find_by(id: x)
✗ Sprockets / Webpacker                      -> ✓ Propshaft + Importmap
✗ @import in CSS / application.css manifest  -> ✓ stylesheet_link_tag :app + @layer
✗ Devise / custom auth                       -> ✓ Rails 8 authentication generator
✗ FactoryBot / RSpec                         -> ✓ fixtures + Minitest
✗ service objects / app/services             -> ✓ model concerns, always
✗ puts / p for debugging                     -> ✓ Rails.logger.debug
✗ ENV["X"] direct                            -> ✓ credentials or config
✗ raw SQL strings                            -> ✓ Active Record query interface
✗ has_and_belongs_to_many                    -> ✓ has_many :through
✗ resources + custom actions                 -> ✓ resources + nested resource
✗ inline JS / <script> tags                  -> ✓ Stimulus controllers
✗ jQuery / lodash                            -> ✓ vanilla JS + Stimulus
✗ migration without [8.1]                    -> ✓ ActiveRecord::Migration[8.1]
```
