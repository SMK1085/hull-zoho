# Zoho CRM _BETA_

> This connector is under active development. The documentation might not be complete and features are subject to change. Please refer to the roadmap section for planned enhancements.

## Getting Started

1. From your Hull Connectors page click on `[Add a Connector]`
2. Search for "Zoho" and click on `[Install]`
3. Authorize Hull to connect with the Zoho API by navigating to Authentication in the Settings:

## Incoming Data Flow

The Zoho CRM Connector can currently synchronize Leads, Contacts and Accounts to Hull. Please refer to the sections below for more details. Note that Subforms and Multi-Lookup Fields cannot be synchronized due to API limitations.

For each Zoho Module you can configure the Identity Resolution, which ensures that incoming data is routed to the proper profile in Hull, and the Attribute Mapping, which defines the Zoho Fields to store in Hull.

### Zoho Leads to Hull Users

Navigate to the Setting section **Leads** and configure the **Incoming Identity** first:

> Picture goes here

By default the Email is not required so you can synchronize all Leads from Zoho CRM into Hull. If a Lead doesn't have an email address, the Zoho ID will be used as `anonymous_id` to identify the user in Hull and most likely the data won't be matched to any current user profile. You can set the Email address as required to avoid this.
If you have a unique identifier field in Zoho which matches the `external_id` in Hull, you can add this to the mapping and decide whether it is required or not. Please note that if you have marked at least one field as required and the Lead in Zoho doesn't have a value for that particular field, the Lead won't be imported into Hull.

Now that you have configured the Identity Resolution part, you can move on the configure which fields from Zoho are stored in Hull. In the Setting section **Leads**, you can configure this under **Incoming Attributes**:

> Picture goes here

Note that all Zoho Lead fields are stored under the attribute group `zoho_lead` on the Hull user profiles. This ensures that they are kept separate from the Contact fields, which are also stored on the Hull user profiles.

_Pro Tip:_ If you add a new mapping to the `Incoming Attributes` section, click on the `[Fetch All Leads]` button to retrieve the newly mapped attribute from Zoho, otherwise the data won't become available until the Lead is marked as modified by Zoho or until the daily full reconciliation runs.

### Zoho Contacts to Hull Users

Navigate to the Setting section **Contacts** and configure the **Incoming Identity** first:

> Picture goes here

By default the Email is not required so you can synchronize all Contacts from Zoho CRM into Hull. If a Contact doesn't have an email address, the Zoho ID will be used as `anonymous_id` to identify the user in Hull and most likely the data won't be matched to any current user profile. You can set the Email address as required to avoid this.
If you have a unique identifier field in Zoho which matches the `external_id` in Hull, you can add this to the mapping and decide whether it is required or not. Please note that if you have marked at least one field as required and the Contact in Zoho doesn't have a value for that particular field, the Contact won't be imported into Hull.

Now that you have configured the Identity Resolution part, you can move on the configure which fields from Zoho are stored in Hull. In the Setting section **Contacts**, you can configure this under **Incoming Attributes**:

> Picture goes here

Note that all Zoho Contact fields are stored under the attribute group `zoho_contact` on the Hull user profiles. This ensures that they are kept separate from the Contact fields, which are also stored on the Hull user profiles.

_Pro Tip:_ If you add a new mapping to the `Incoming Attributes` section, click on the `[Fetch All Contacts]` button to retrieve the newly mapped attribute from Zoho, otherwise the data won't become available until the Contact is marked as modified by Zoho or until the daily full reconciliation runs.

### Zoho Accounts to Hull Accounts

Navigate to the Setting section **Accounts** and configure the **Incoming Identity** first:

> Picture goes here

By default the Website is not required so you can synchronize all Accounts from Zoho CRM into Hull. If a Account doesn't have an Website, the Zoho ID will be used as `anonymous_id` to identify the account in Hull and most likely the data won't be matched to any current account profile. You can set the Website as required to avoid this.
If you have a unique identifier field in Zoho which matches the `external_id` in Hull, you can add this to the mapping and decide whether it is required or not. Please note that if you have marked at least one field as required and the Account in Zoho doesn't have a value for that particular field, the Account won't be imported into Hull.

Now that you have configured the Identity Resolution part, you can move on the configure which fields from Zoho are stored in Hull. In the Setting section **Accounts**, you can configure this under **Incoming Attributes**:

> Picture goes here

Note that all Zoho Account fields are stored under the attribute group `zoho` on the Hull account profiles.

_Pro Tip:_ If you add a new mapping to the `Incoming Attributes` section, click on the `[Fetch All Accounts]` button to retrieve the newly mapped attribute from Zoho, otherwise the data won't become available until the Account is marked as modified by Zoho or until the daily full reconciliation runs.

## FAQ

### How often is data synchronized between Zoho CRM and Hull

**Outgoing data** (from Hull to Zoho) is currently not supported. Once this feature is available, outgoing data will be synchronized almost immediately. You can check the backlog on the _Overview_ page of your Zoho CRM Connector to see if there is any delay.

**Incoming data** (from Zoho to Hull) is received via Notifications from Zoho CRM. Notifications are webhooks and this means that data is typically received within a few seconds. Since webhooks are fire and forget, there might be the rare conditions where a webhook is missed. To ensure that your data is up-to-date, the Zoho CRM connector synchronizes every 60 minutes all Leads, Contacts and Accounts which have a modified time within the past hour. And every 24 hours the Zoho CRM connector performs a full reconciliation and fetches all Leads, Contacts and Accounts from Zoho CRM.

### What scopes does the Zoho CRM Connector require

The Zoho CRM connector needs to be able to access the Metadata, read and write CRM Objects and register Notifications. Therefore the following scopes are required:

- `ZohoCRM.users.ALL`
- `ZohoCRM.modules.leads.ALL`
- `ZohoCRM.modules.accounts.ALL`
- `ZohoCRM.modules.contacts.ALL`
- `ZohoCRM.settings.ALL`
- `ZohoCRM.notifications.ALL`

Please make sure that your Zoho User can grant access to all the necessary scopes. If you don't have the required permissions, please ask your Zoho administrator for help.

## Roadmap

The following table describes the current roadmap. If you like to request additions, please use the [GitHub Issues Page](https://github.com/SMK1085/hull-zoho/issues).

| Priority | Estimated Delivery Date | Feature Description                                       |
| -------- | ----------------------- | --------------------------------------------------------- |
| 1        | 2020-09-30              | Outgoing Synchronization for Leads, Contacts and Accounts |
| 2        | 2020-10-01              | Automated handling of Lead conversions                    |
| 3        | 2020-10-05              | Full automated test coverage                              |
| 4        | 2020-10-06              | General Availability Release                              |
