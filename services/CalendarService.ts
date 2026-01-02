interface CalendarEventOptions {
  description?: string;
  location?: string;
  guests?: string;
  sendInvites?: boolean;
  visibility?: GoogleAppsScript.Calendar.Visibility;
  guestsCanModify?: boolean;
  guestsCanInviteOthers?: boolean;
  guestsCanSeeOtherGuests?: boolean;
}

export class CalendarService {
  private calendar: GoogleAppsScript.Calendar.Calendar;
  private calendarId: string;

  constructor(calendarId: string) {
    try {
      const cal = CalendarApp.getCalendarById(calendarId);
      if (!cal) {
        throw new Error(`Calendar with ID ${calendarId} not found`);
      }
      this.calendar = cal;
      this.calendarId = calendarId;
    } catch (error) {
      console.error(`Failed to initialize calendar with ID ${calendarId}:`, error);
      throw error;
    }
  }

  private static combineDateAndTime(dateBase: Date, timeString: string): Date {
    const combined = new Date(dateBase);
    const [hours, minutes] = timeString.split(":").map(Number);

    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Invalid time format: ${timeString}`);
    }

    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }

  async createEvent(options: {
    title: string;
    description: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    guests?: string[];
    sendInvites?: boolean;
    recurrenceRules?: string[]; // Changed to accept RRULE strings directly
  }): Promise<string> {
    const eventDate = new Date(options.startTime);
    eventDate.setHours(0, 0, 0, 0);

    const startTimeStr = `${options.startTime.getHours()}:${options.startTime.getMinutes()}`;
    const endTimeStr = `${options.endTime.getHours()}:${options.endTime.getMinutes()}`;

    const startDateTime = CalendarService.combineDateAndTime(eventDate, startTimeStr);
    const endDateTime = CalendarService.combineDateAndTime(eventDate, endTimeStr);

    // If recurrence rules are provided, use Calendar Advanced Service API
    if (options.recurrenceRules && options.recurrenceRules.length > 0) {
      return this.createRecurringEventWithAdvancedAPI(
        options.title,
        options.description,
        startDateTime,
        endDateTime,
        options.location,
        options.guests,
        options.recurrenceRules,
        options.sendInvites ?? true
      );
    }

    // For one-time events, use the simple CalendarApp API
    const eventOptions: CalendarEventOptions = {
      description: options.description,
      location: options.location,
      guests: options.guests?.join(","),
      sendInvites: options.sendInvites ?? true,
      visibility: CalendarApp.Visibility.DEFAULT,
      guestsCanModify: true,
      guestsCanInviteOthers: true,
      guestsCanSeeOtherGuests: true,
    };

    const event = this.calendar.createEvent(options.title, startDateTime, endDateTime, eventOptions);
    event.addEmailReminder(14400);
    event.setGuestsCanInviteOthers(true);
    event.setVisibility(CalendarApp.Visibility.DEFAULT);

    return event.getId();
  }

  /**
   * Creates a recurring event using the Calendar Advanced Service (Google Calendar API v3)
   * This creates a SINGLE event with recurrence rules, not multiple individual events
   */
  private createRecurringEventWithAdvancedAPI(
    title: string,
    description: string,
    startDateTime: Date,
    endDateTime: Date,
    location?: string,
    guests?: string[],
    recurrenceRules?: string[],
    sendInvites: boolean = true
  ): string {
    // Format datetime for Google Calendar API
    const formatDateTime = (date: Date): string => {
      return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
    };

    // Create event using Calendar Advanced Service
    const event: GoogleAppsScript.Calendar.Schema.Event = {
      summary: title,
      description: description,
      location: location,
      start: {
        dateTime: formatDateTime(startDateTime),
        timeZone: Session.getScriptTimeZone(),
      },
      end: {
        dateTime: formatDateTime(endDateTime),
        timeZone: Session.getScriptTimeZone(),
      },
      recurrence: recurrenceRules,
      attendees: guests?.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 14400 }, // 10 days before
        ],
      },
      guestsCanModify: true,
      guestsCanInviteOthers: true,
      guestsCanSeeOtherGuests: true,
      visibility: 'default',
    };

    try {
      if (!Calendar || !Calendar.Events) {
        throw new Error("Calendar Advanced Service is not enabled. Please enable it in the Apps Script project settings.");
      }

      const createdEvent = Calendar.Events.insert(event, this.calendarId, {
        sendUpdates: sendInvites ? 'all' : 'none',
      });

      if (!createdEvent || !createdEvent.id) {
        throw new Error("Failed to create recurring event - no ID returned");
      }

      console.log(`Created recurring event with ID: ${createdEvent.id}`);
      return createdEvent.id;
    } catch (error) {
      console.error("Error creating recurring event with Advanced API:", error);
      throw error;
    }
  }

  async updateEvent(
    eventId: string,
    options: {
      title?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      location?: string;
      guests?: string[];
    },
  ): Promise<void> {
    const event = this.calendar.getEventById(eventId);
    if (!event) {
      console.warn(`Event with ID ${eventId} not found in calendar ${this.calendar.getName()}.`);
      return;
    }

    if (options.title) event.setTitle(options.title);
    if (options.description) event.setDescription(options.description);
    if (options.startTime && options.endTime) {
      event.setTime(options.startTime, options.endTime);
    }
    if (options.location) event.setLocation(options.location);
    if (options.guests) {
      options.guests.forEach((guest) => event.addGuest(guest));
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    const event = this.calendar.getEventById(eventId);
    if (event) {
      event.deleteEvent();
    }
  }

  /**
   * Gets all instances of a recurring event series
   * Returns array of objects with eventId and start date for each instance
   */
  async getEventInstances(recurringEventId: string): Promise<Array<{ eventId: string; start: Date; end: Date }>> {
    try {
      if (!Calendar || !Calendar.Events) {
        throw new Error("Calendar Advanced Service is not enabled.");
      }

      // Get all instances of the recurring event
      const instances = Calendar.Events.instances(this.calendarId, recurringEventId, {
        maxResults: 500,
        timeMin: new Date().toISOString(), // Only future/current instances
      });

      if (!instances || !instances.items) {
        console.log(`No instances found for event ${recurringEventId}`);
        return [];
      }

      const result: Array<{ eventId: string; start: Date; end: Date }> = [];
      
      for (const instance of instances.items) {
        if (instance.id && instance.start && instance.end) {
          const startDate = instance.start.dateTime 
            ? new Date(instance.start.dateTime)
            : new Date(instance.start.date!);
          const endDate = instance.end.dateTime
            ? new Date(instance.end.dateTime)
            : new Date(instance.end.date!);
            
          result.push({
            eventId: instance.id,
            start: startDate,
            end: endDate,
          });
        }
      }

      console.log(`Found ${result.length} instances for recurring event ${recurringEventId}`);
      return result;
    } catch (error) {
      console.error(`Error getting event instances for ${recurringEventId}:`, error);
      return [];
    }
  }

  /**
   * Deletes all instances of a recurring event series using the Advanced Calendar API
   */
  async deleteEventSeries(recurringEventId: string): Promise<number> {
    try {
      if (!Calendar || !Calendar.Events) {
        throw new Error("Calendar Advanced Service is not enabled.");
      }

      // Get all instances of the recurring event
      const instances = Calendar.Events.instances(this.calendarId, recurringEventId, {
        maxResults: 500,
      });

      if (!instances || !instances.items) {
        console.log(`No instances found for event ${recurringEventId}`);
        return 0;
      }

      let deletedCount = 0;
      for (const instance of instances.items) {
        if (instance.id) {
          try {
            Calendar.Events.remove(this.calendarId, instance.id);
            deletedCount++;
          } catch (error) {
            console.error(`Error deleting instance ${instance.id}:`, error);
          }
        }
      }

      console.log(`Deleted ${deletedCount} instances of event ${recurringEventId}`);
      return deletedCount;
    } catch (error) {
      console.error(`Error deleting event series ${recurringEventId}:`, error);
      // Fall back to simple delete
      await this.deleteEvent(recurringEventId);
      return 1;
    }
  }
}
