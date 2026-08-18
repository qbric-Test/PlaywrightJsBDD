@olx @regression
Feature: OLX Pakistan Mobiles Category

  As a buyer browsing OLX Pakistan
  I want to open the Mobiles category and sort the adverts by how recently they were listed
  So that I see the newest mobile phones on offer first

  @smoke
  Scenario: Verify Mobiles Category Page And Sorting Functionality
    Given I open OLX Pakistan website
    When I click on "Mobiles" from the top categories section
    Then the Mobiles page should load successfully
    And page title should contain "Mobiles for Sale in Pakistan"
    And Country dropdown should have "Pakistan" selected
    And Search textbox placeholder should be "Find Cars, Mobile Phones and more..."
    When I select "Newly listed" from the Sort By dropdown
    Then listings should be refreshed
    And mobile listings should be displayed successfully
