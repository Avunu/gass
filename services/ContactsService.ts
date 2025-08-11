interface PersonResponse extends GoogleAppsScript.PeopleAdvanced.Schema.Person {
  etag?: string;
}

export class ContactsService {
  static async getContact(resourceName: string): Promise<PersonResponse> {
    return PeopleAdvanced.People.get(resourceName, {
      personFields: "names,emailAddresses,addresses,phoneNumbers,userDefined,birthdays,events",
    });
  }

  static async findContact(query: string): Promise<string | null> {
    const response = PeopleAdvanced.People.searchContacts({
      query,
      readMask: "names,emailAddresses",
      pageSize: 1,
    });
    return response.results && response.results.length > 0
      ? response.results[0].person?.resourceName || null
      : null;
  }

  static async createContact(person: GoogleAppsScript.PeopleAdvanced.Schema.Person): Promise<string> {
    const response = PeopleAdvanced.People.createContact(person);
    return response.resourceName || "";
  }

  static async updateContact(
    resourceName: string,
    person: GoogleAppsScript.PeopleAdvanced.Schema.Person,
  ): Promise<void> {
    // First get the current contact to obtain the etag
    const currentContact = await this.getContact(resourceName);
    if (!currentContact.etag) {
      throw new Error("Could not get etag for contact update");
    }

    // Only include the new data and the required etag
    const updatePerson = {
      etag: currentContact.etag,
      names: person.names || [],
      emailAddresses: person.emailAddresses || [],
      addresses: person.addresses || [],
      phoneNumbers: person.phoneNumbers || [],
      userDefined: person.userDefined || [],
      birthdays: person.birthdays || [],
      events: person.events || [],
    };

    PeopleAdvanced.People.updateContact(updatePerson, resourceName, {
      updatePersonFields: "names,emailAddresses,addresses,phoneNumbers,userDefined,birthdays,events",
    });
  }
}
