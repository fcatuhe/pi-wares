Review this controller action from our Rails app and tell me what you'd change.

```ruby
class InvitationsController < ApplicationController
  def accept
    invitation = Invitation.find_by(token: params[:token])
    user = User.find_or_create_by(email: invitation.email)
    user.update(password: params[:password]) if params[:password]
    invitation.account.memberships.create(user: user, role: params[:role] || "member")
    invitation.update(accepted_at: Time.now)
    session[:user_id] = user.id
    redirect_to root_path
  rescue => e
    redirect_to root_path, alert: "Something went wrong"
  end
end
```
