import {DocumentIndex} from "@vladimiry/ndx";

import {IndexableMail} from "src/shared/model/database";

export type MailsIndex = DocumentIndex<IndexableMail["pk"], IndexableMail>;
