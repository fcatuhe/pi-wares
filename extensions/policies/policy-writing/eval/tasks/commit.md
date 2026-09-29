Write the commit message for this diff. Reply with the message only.

```diff
--- a/app/models/subscription.rb
+++ b/app/models/subscription.rb
@@ -12,9 +12,13 @@ class Subscription < ApplicationRecord
-  after_save :notify_billing
+  after_save :track_plan_change
+  after_commit :notify_billing, if: :plan_changed_in_transaction?
 
-  def notify_billing
-    BillingSyncJob.perform_later(self) if saved_change_to_plan?
+  def track_plan_change
+    @plan_changed_in_transaction = saved_change_to_plan?
+  end
+
+  def plan_changed_in_transaction? = @plan_changed_in_transaction
+
+  def notify_billing
+    BillingSyncJob.perform_later(self)
   end
--- a/test/models/subscription_test.rb
+++ b/test/models/subscription_test.rb
@@ -30,0 +31,8 @@
+  test "billing sync is enqueued only after the plan change commits" do
+    assert_enqueued_with(job: BillingSyncJob) do
+      Subscription.transaction { subscriptions(:acme).update!(plan: "pro") }
+    end
+    assert_no_enqueued_jobs(only: BillingSyncJob) do
+      subscriptions(:acme).update!(seats: 12)
+    end
+  end
```
