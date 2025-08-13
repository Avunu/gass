// peopleService.d.ts

declare namespace GoogleAppsScript {
  namespace PeopleAdvanced {
    interface PeopleService {
      People: PeopleCollection;
    }

    interface PeopleCollection {
      get(resourceName: string, optionalArgs?: object): Schema.Person;
      searchContacts(params: { query: string; readMask: string; pageSize?: number }): Schema.SearchResponse;
      createContact(contact: Schema.Person): Schema.Person;
      updateContact(contact: Schema.Person, resourceName: string, optionalArgs?: object): Schema.Person;
    }

    namespace Schema {
      interface Person {
        resourceName?: string;
        etag?: string;
        names?: Name[];
        emailAddresses?: EmailAddress[];
        phoneNumbers?: PhoneNumber[];
        addresses?: Address[];
        birthdays?: Birthday[];
        events?: Event[];
        userDefined?: UserDefinedField[];
      }

      interface Name {
        displayName?: string;
        familyName?: string;
        givenName?: string;
        middleName?: string;
        displayNameLastFirst?: string;
        unstructuredName?: string;
      }

      interface EmailAddress {
        value?: string;
        formattedType?: string;
      }

      interface PhoneNumber {
        value?: string;
        formattedType?: string;
      }

      interface Address {
        streetAddress?: string;
        formattedType?: string;
      }

      interface DateObject {
        year?: number;
        month?: number;
        day?: number;
      }

      interface Birthday {
        date?: DateObject;
        text?: string;
      }

      interface Event {
        date?: DateObject;
        type?: string;
        formattedType?: string;
      }

      interface UserDefinedField {
        key?: string;
        value?: string;
      }

      interface SearchResponse {
        results?: SearchResult[];
      }

      interface SearchResult {
        person?: Person;
      }
    }
  }
}

declare const PeopleAdvanced: GoogleAppsScript.PeopleAdvanced.PeopleService;
