resource "aws_sns_topic" "notifications" {
  name         = "elevator-notifications-${var.env_name}"
  display_name = "Elevator Notification Topic"
}
