Feature: Read-only live parent game tracker
  As a parent watching remotely
  I want a public-safe scoreboard and chronological game timeline
  So I can follow play without accessing scorekeeper controls.

  Background:
    Given the game is Pasadena Maple Leafs versus Santa Clarita Flyers
    And the parent tracker has a public-safe game snapshot

  @PARENT-001 @unit @ui
  Scenario: Public scoreboard and current period
    When the parent opens the game tracker
    Then the two team names, public scores, period, and clock are displayed
    And no scoring command controls are available

  @PARENT-002 @unit @ui
  Scenario: Goal appears in the live feed
    Given the operator has confirmed a goal with a stable event ID
    When the parent receives the updated game snapshot
    Then the goal appears with team, period, clock time, scorer and assists

  @PARENT-003 @unit
  Scenario: TBD goal attribution is not invented
    Given a goal was confirmed with TBD scorer and TBD first assist
    When the goal appears in the parent tracker
    Then TBD is shown for the unknown attribution
    And None is distinguished from TBD

  @PARENT-004 @unit
  Scenario: Correct attribution without another goal
    Given the goal has event ID G1 and TBD attribution
    When an authorized correction refers to G1
    Then G1 displays the corrected attribution
    And the timeline contains exactly one goal for G1

  @PARENT-005 @unit @ui
  Scenario: Penalty event
    Given the operator has confirmed a tripping penalty
    When the parent receives the event
    Then the penalty shows team, player number, infraction and duration

  @PARENT-006 @unit @ui
  Scenario: End of period
    When a period-ended event is published
    Then the timeline shows the period-end milestone

  @PARENT-007 @unit
  Scenario: Public mercy score differs from official score
    Given the official score is 9 to 2 and the public differential cap is five
    When the parent opens the tracker
    Then the public scoreboard shows 7 to 2
    And the official 9 to 2 score is not disclosed in the public snapshot

  @PARENT-008 @unit
  Scenario: Duplicate delivery
    Given an event with ID G1 has already been delivered
    When the same event with ID G1 is delivered again
    Then only one timeline entry represents G1

  @PARENT-009 @integration
  Scenario: Reconnect after missing events
    Given the client disconnects after revision 14
    When it reconnects and requests events after revision 14
    Then the server returns the missing events in order
    And the client deduplicates event IDs

  @PARENT-010 @security
  Scenario: Public feed excludes operator diagnostics
    When the public game feed is published
    Then operator draft actions, audit logs, and private player information are excluded
    And the spectator cannot modify official game state

  @PARENT-011 @unit
  Scenario: Rescinded goal is not silently deleted
    Given goal G1 appears in the feed
    When an authorized goal-void event references G1
    Then the original goal is marked rescinded
    And the audit record remains available to authorized officials

  @PARENT-012 @integration
  Scenario: Feed connection state is accurate
    Given the server connection is lost
    When the last update exceeds the configured freshness threshold
    Then the tracker clearly displays a stale or disconnected indicator
    And does not claim that the scoreboard is live
