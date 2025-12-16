import { camera } from 'ionicons/icons';
import { IonContent, 
         IonAlert,
         IonFab, 
         IonFabButton, 
         IonHeader, 
         IonIcon, 
         IonButton,
         IonPage, 
         IonTitle, 
         IonToolbar,
         IonGrid,
         IonRow,
         IonCol,
         IonImg, 
         useIonViewWillEnter,
        } from '@ionic/react';
import { useState } from 'react';
import { usePhotoGallery } from '../hooks/usePhotoGallery';
import './Tab2.css';

// Photo Gallery tab.
//
// Displays locally-stored photos from the shared gallery store (usePhotoGallery).
// Provides deletion (with confirmation) and ensures the list reloads when the tab
// becomes active so images added from other tabs appear immediately.

const Tab2: React.FC = () => {
  const { photos, addNewToGallery, reloadPhotos, deletePhotoFromGallery } = usePhotoGallery();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);

  useIonViewWillEnter(() => {
    // Ensure we show the latest persisted gallery contents.
    reloadPhotos();
  });

  const pendingPhoto = pendingDeletePath ? photos.find((p) => p.filepath === pendingDeletePath) : undefined;
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Photo Gallery</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Photo Gallery</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonGrid>
          <IonRow>
            {photos.map((photo) => (
              <IonCol size='6' key={photo.filepath}>
                <div style={{ position: 'relative' }}>
                  <IonImg src={photo.webviewPath} />
                  {/* X button removes an image from the gallery after confirmation. */}
                  <IonButton
                    size="small"
                    fill="solid"
                    color="medium"
                    onClick={() => {
                      setPendingDeletePath(photo.filepath);
                      setDeleteOpen(true);
                    }}
                    style={{ position: 'absolute', top: 8, right: 8, minWidth: 28, height: 28 }}
                  >
                    X
                  </IonButton>
                </div>
              </IonCol>
            ))}
          </IonRow>
        </IonGrid>

        <IonAlert
          isOpen={deleteOpen}
          header="Remove photo?"
          message="This will permanently delete the photo from the gallery and device storage."
          onDidDismiss={() => {
            setDeleteOpen(false);
            setPendingDeletePath(null);
          }}
          buttons={[
            {
              text: 'Cancel',
              role: 'cancel',
            },
            {
              text: 'Delete',
              role: 'destructive',
              handler: async () => {
                // Delete from Preferences/state and remove the underlying file.
                if (pendingPhoto) {
                  await deletePhotoFromGallery(pendingPhoto);
                }
                setDeleteOpen(false);
                setPendingDeletePath(null);
              },
            },
          ]}
        />
        <IonFab vertical='bottom' horizontal='center' slot='fixed'>
          <IonFabButton onClick={() => addNewToGallery()}>
            <IonIcon icon={camera}></IonIcon>
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default Tab2;
