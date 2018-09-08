import {FolderWithMailsReference as Folder, MailWithFolderReference as Mail} from "src/shared/model/database";

export class DbViewUtil {
    static trackByEntityPk(index: number, {pk}: Folder | Mail) {
        return pk;
    }
}
