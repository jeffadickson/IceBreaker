"""IceBreaker Frappe app registration. Do not override Frappe core."""
app_name = "icebreaker_league"
app_title = "IceBreaker League"
app_publisher = "IceBreaker Contributors"
app_description = "Central league, season, division, team and schedule management"
app_email = "maintainers@example.invalid"
app_license = "MIT"
required_apps = ["frappe"]

# Initial schemas deliberately grant access only to System Manager.
# Scoped League Administrator roles will be enabled only after permission
# query and record-level cross-league isolation tests pass.

# Create the narrow role during app installation. It has no generic DocType
# grants; league membership is checked explicitly in read-only APIs.
after_install = "icebreaker_league.setup.after_install"
