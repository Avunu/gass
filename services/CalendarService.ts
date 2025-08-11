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

  constructor(calendarId: string) {
    try {
      const cal = CalendarApp.getCalendarById(calendarId);
      if (!cal) {
        throw new Error(`Calendar with ID ${calendarId} not found`);
      }
      this.calendar = cal;
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
  }): Promise<string> {
    const eventDate = new Date(options.startTime);
    eventDate.setHours(0, 0, 0, 0);

    const startTimeStr = `${options.startTime.getHours()}:${options.startTime.getMinutes()}`;
    const endTimeStr = `${options.endTime.getHours()}:${options.endTime.getMinutes()}`;

    const startDateTime = CalendarService.combineDateAndTime(eventDate, startTimeStr);
    const endDateTime = CalendarService.combineDateAndTime(eventDate, endTimeStr);

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
}
