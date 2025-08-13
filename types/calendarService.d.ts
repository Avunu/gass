// Google Apps Script Advanced Calendar API Interface

declare namespace GoogleAppsScript {
  namespace CalendarAdvanced {
    interface CalendarService {
      Events: EventsCollection;
      CalendarList: CalendarListCollection;
    }

    interface EventsCollection {
      insert(resource: Schema.Event, calendarId: string, optionalArgs?: object): Schema.Event;
      update(
        resource: Schema.Event,
        calendarId: string,
        eventId: string,
        optionalArgs?: object,
      ): Schema.Event;
      get(calendarId: string, eventId: string, optionalArgs?: object): Schema.Event;
      remove(calendarId: string, eventId: string, optionalArgs?: object): void;
      // Additional methods can be added here as needed
    }

    interface CalendarListCollection {
      list(optionalArgs?: object): Schema.CalendarList;
      // Additional methods can be added here as needed
    }

    namespace Schema {
      interface CalendarList {
        items?: CalendarListEntry[];
      }

      interface CalendarListEntry {
        kind: "calendar#calendarListEntry";
        etag: string;
        id: string;
        summary: string;
        description?: string;
        location?: string;
        timeZone?: string;
        summaryOverride?: string;
        colorId?: string;
        backgroundColor?: string;
        foregroundColor?: string;
        hidden?: boolean;
        selected?: boolean;
        accessRole: string;
        defaultReminders?: { method: string; minutes: number }[];
        notificationSettings?: {
          notifications?: { type: string; method: string }[];
        };
        primary?: boolean;
        deleted?: boolean;
        conferenceProperties?: {
          allowedConferenceSolutionTypes?: string[];
        };
      }

      interface EventDateTime {
        date?: string; // For all-day events
        dateTime?: string; // For events with specific time
        timeZone?: string;
      }

      interface EventAttendee {
        email?: string;
        responseStatus?: string;
        // Additional properties can be added here as needed
      }

      interface EventPerson {
        id?: string;
        email?: string;
        displayName?: string;
        self?: boolean;
      }

      interface EventConferenceData {
        createRequest?: {
          requestId?: string;
          conferenceSolutionKey?: { type?: string };
          status?: { statusCode?: string };
        };
        entryPoints?: {
          entryPointType?: string;
          uri?: string;
          label?: string;
          pin?: string;
          accessCode?: string;
          meetingCode?: string;
          passcode?: string;
          password?: string;
        }[];
        conferenceSolution?: {
          key?: { type?: string };
          name?: string;
          iconUri?: string;
        };
        conferenceId?: string;
        signature?: string;
        notes?: string;
      }

      interface EventGadget {
        type?: string;
        title?: string;
        link?: string;
        iconLink?: string;
        width?: number;
        height?: number;
        display?: string;
        preferences?: { [key: string]: string };
      }

      interface EventSource {
        url?: string;
        title?: string;
      }

      interface EventWorkingLocation {
        type?: string;
        homeOffice?: boolean;
        customLocation?: { label?: string };
        officeLocation?: {
          buildingId?: string;
          floorId?: string;
          floorSectionId?: string;
          deskId?: string;
          label?: string;
        };
      }

      interface EventOutOfOfficeProperties {
        autoDeclineMode?: string;
        declineMessage?: string;
      }

      interface EventFocusTimeProperties {
        autoDeclineMode?: string;
        declineMessage?: string;
        chatStatus?: string;
      }

      interface EventAttachment {
        fileUrl?: string;
        title?: string;
        mimeType?: string;
        iconLink?: string;
        fileId?: string;
      }

      interface Event {
        kind?: string;
        etag?: string;
        id?: string;
        status?: string;
        htmlLink?: string;
        created?: Date;
        updated?: Date;
        summary?: string;
        description?: string;
        location?: string;
        colorId?: string;
        creator?: EventPerson;
        organizer?: EventPerson;
        start?: EventDateTime;
        end?: EventDateTime;
        endTimeUnspecified?: boolean;
        recurrence?: string[];
        recurringEventId?: string;
        originalStartTime?: EventDateTime;
        transparency?: string;
        visibility?: string;
        iCalUID?: string;
        sequence?: number;
        attendees?: EventAttendee[];
        attendeesOmitted?: boolean;
        extendedProperties?: {
          private?: { [key: string]: string };
          shared?: { [key: string]: string };
        };
        hangoutLink?: string;
        conferenceData?: EventConferenceData;
        gadget?: EventGadget;
        anyoneCanAddSelf?: boolean;
        guestsCanInviteOthers?: boolean;
        guestsCanModify?: boolean;
        guestsCanSeeOtherGuests?: boolean;
        privateCopy?: boolean;
        locked?: boolean;
        reminders?: {
          useDefault?: boolean;
          overrides?: {
            method?: string;
            minutes?: number;
          }[];
        };
        source?: EventSource;
        attachments?: EventAttachment[];
        workingLocation?: EventWorkingLocation;
        outOfOfficeProperties?: EventOutOfOfficeProperties;
        focusTimeProperties?: EventFocusTimeProperties;
      }
    }
  }
}

// Global variable declaration
declare const CalendarAdvanced: GoogleAppsScript.CalendarAdvanced.CalendarService;
