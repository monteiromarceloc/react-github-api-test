import { Octokit } from "@octokit/rest";
import { setIsAuthenticated } from "../store/MainReducer";
import firebase from './firebaseCredentials';

const token = process.env.REACT_APP_AUTH_TOKEN || "" /* YOU TOKEN HERE */
const org = "studiosol"
const mediaType = { previews: ['inertia'] }
const ccid = 6132089
const db = firebase.database();

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({ auth: token });

export const authService = {
  signIn: async (email, password, dispatch, toast, onSucess, onFailure) => {
    try {
      const data = await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => firebase.auth().signInWithEmailAndPassword(email, password));
      const uid = data?.user?.uid;

      if (uid) {
        dispatch(setIsAuthenticated(true));
        const snap = await db.ref(`users/${uid}`).get();

        if (!snap.exists()) {
          await firebase.auth().sendPasswordResetEmail(email);
          toast.info('Enviamos um email de redefinição de senha para você');

          db.ref(`users/${uid}`).set({
            lastLogin: firebase.database.ServerValue.TIMESTAMP
          })
        }
        if (onSucess) onSucess();
        return;
      }
      throw new Error('Uid not found');
    }
    catch (err) {
      console.log('SignIn Error: ', err);
      toast.warn('Falha ao logar. Confira seus dados.');
      if (onFailure) onFailure();
    }
  },
}

export const apiService = {
  getProjects: async () => {
    try {
      const response = await octokit.request('GET /orgs/{org}/projects', { org, mediaType })
      return response.data.map(e => ({
        id: e.id,
        name: e.name,
      }));
    } catch (error) {
      console.log('getProjects error: ', JSON.stringify(error))
    }
  },

  getColumns: async (project_id) => {
    try {
      const response = await octokit.request('GET /projects/{project_id}/columns', {
        project_id: ccid, mediaType
      });
      const payload = response.data.map(e => ({
        id: e.id,
        name: e.name,
      }));
      db.ref('columns').get().then((snap) => {
        if (!snap.exists()) {
          console.log('FBColumns empty');
          payload.forEach(e => db.ref(`columns/${e.id}`).set({ name: e.name }));
        }
      })
      return payload;
    } catch (error) {
      console.log('getColumns error: ', error)
    }
  },

  getCards: async (column_id) => {
    try {
      const response = await octokit.request('GET /projects/columns/{column_id}/cards', {
        column_id, mediaType
      });

      // COMPARAÇÃO COM ESTADO ANTERIOR
      const snap = await db.ref(`columns/${column_id}/cards`).get()
      if (snap.exists()) {
        const cards = snap.val();

        let responsePayload = response.data.map((e, i) => ({
          ...e,
          new: !cards[e.id]
        }));
        return responsePayload;
      }
      else {
        console.log('FBCards empty');
        response.data.forEach(({ id, content_url }) => db.ref(`columns/${column_id}/cards/${id}`).set({ content_url }));
      }
      return response.data;
    } catch (error) {
      console.log('getCards error: ', error)
    }
  },

  getIssue: async (repo, issue_number) => {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
        owner: org,
        repo,
        issue_number,
        mediaType
      });
      return response.data;
    } catch (error) {
      console.log('getIssue error: ', error)
    }
  },

  updateFB: async (column_id, cards) => {
    try {
      const payload = {};
      cards.forEach(data => {
        if (data.content_url) {
          const { id, content_url } = data;
          payload[id] = {
            id,
            content_url
          }
        } else {
          const { id, url } = data;
          payload[id] = {
            id,
            url
          }
        }
      });
      db.ref(`columns/${column_id}/cards`).set(payload);
    } catch (error) {
      console.log('updateFB error: ', error)
    }
  }
}
